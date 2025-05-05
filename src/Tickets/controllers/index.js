const auth0 = require('auth0');
const jwt = require('jsonwebtoken');
const prisma = require('../../prisma');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { promisify } = require('util');
const { BlobServiceClient } = require('@azure/storage-blob');
const unlinkAsync = promisify(fs.unlink);
const express = require('express');
const app = express();
const ticketServices = require('../services/')
const { dateFormatForDatabaseRequest } = require('../../utils/date');
const { successfulResponse } = require('../../utils/response-helper');
const { updateTicket } = require('../../controllers');
app.use(express.json());

  const checkPermission = (claims, permission) => {

    if (!claims || !claims.permissions || !claims.permissions.includes(permission)) {
      return false;
    }
    return true;
  };
  
  const requirePermission = (permission) => {
    return (req, res, next) => {
  
      const authHeader = req.headers.authorization;
  
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Invalid access token." });
      }
  
      const token = authHeader.substring(7);
  
      console.log(token)
      const decodedToken = jwt.decode(token);
  
      if (!checkPermission(decodedToken, permission)) {
        return res.status(403).json({ message: `You are not allowed to ${permission}.` });
      }
  
      next();
    };
  };
  exports.createTicket = async (req, res) => {

    console.log('holis')
    /*
      1. Validar que payload request sea el esperado para consumir servicios
      2. Consumir y retornar un 200 cuando sea exitoso y un 500 cuando falle

      const objetoAValidar = {
        propiedad: string
      }
      
      console.log('check true', Object.hasOwn(objetoAValidar, 'propiedad')) // true
      console.log('check true', Object.hasOwn(objetoAValidar, 'propiedad2')) // false
      Object.hasOwn(objeto a validar, propiedad a validar)
    */
    try {
      /*
        Aqui validamos que tenemos la data requerida, agregar mas escenarios si es requerido
        consultar sobre joi lib
        crear funcionalidad validadora que recibe el req.body etc etc
      */

      if (!Object.hasOwn(req.body, 'incident_date')) {
        res.status(400).send('Invalid request missing incident_date')
      }

      let newTicket = req.body;

      // Parse the `ticket` field if it is a stringified JSON
      if (typeof newTicket.ticket === 'string') {
        newTicket = JSON.parse(newTicket.ticket);
      }

      if (newTicket.incident_date) {
        newTicket.incident_date = dateFormatForDatabaseRequest(newTicket.incident_date);
      }

      const createdTicket = await ticketServices.createTicketService(newTicket)
      
      res.status(200).json(successfulResponse({data: createdTicket, message: "Ticket created successful!"}));
    } catch (error) {
      console.error('Error creating ticket:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
  

  exports.updateTicket = async (req, res) => {
    console.log('Request Body:', req.body); // Ver contenido del body
    let ticketId = req.params.id;
    console.log('Ticket ID:', ticketId); // Ver ID del ticket
    const { Category, Status, Solution, ...updatedFields } = req.body;
    console.log('Updated Fields:', updatedFields); // Ver campos a actualizar
    /*
      req.body = { attr1: 'valor1', attr2 }
      req.body.attr1 
      destructuring
      const { attr1 } = req.body
      console.log(attr1) === console.log(req.body.attr1)
    */
    // Parse the ticket ID if it's a number.
    if (!isNaN(ticketId)) {
      ticketId = parseInt(ticketId, 10);
    }
  
    // // Handle JiraTicketID if provided.
    // FIXME: Funcionlidad a desarrollar 
    // if (JiraTicketID !== undefined) {
    //   updatedFields.JiraTicket = JiraTicketID === null
    //     ? { disconnect: true }
    //     : { connect: { id: parseInt(jira_ticket_id, 10) } };
    // }
  
    // we add the ticketId recieved from the params as id to the updatedFields object
    updatedFields.id = ticketId;
    if (Category) {
      updatedFields.category = Category; // Normalize field name
    }
    if (Status){
      updatedFields.status = Status;
    }
    if (Solution){
      updatedFields.solution = Solution;
    }
    try {
      console.log('Updating ticket with data:', updatedFields); // Ver los datos antes de la actualización
      
      const updatedTicket = await ticketServices.updateTicketService(updatedFields)
  
      console.log('Ticket updated successfully:', updatedTicket); // Ver el resultado de la actualización
      res.status(200).json(successfulResponse({data: updatedTicket, message: "Ticket updated successfuly!"}));
    } catch (error) {
      console.error("Error updating ticket:", error);
      res.status(500).json({ error: "Internal server error", details: error.message });
    }
  };
  


  exports.getTickets = async (req, res) => {
    try {
      const tickets = await prisma.ticket.findMany({
        
      });
  
      const ticketsWithCustomerNames = tickets.map(ticket => ({
        ...ticket,
        Customer: ticket.Customer?.CustomerName || null,
        User: ticket.AssignedUser?.Username || null
      }));
  
      res.json(ticketsWithCustomerNames);
    } catch (error) {
      console.error('Error getting ticket list:', error);
      res.status(500).json({ message: 'Internal server error getting ticket list.' });
    }
  };


  const { Parser } = require('json2csv');

  exports.exportAllTickets = async (req, res) => {
    console.log('Export endpoint hit');
    
    try {
      const tickets = await prisma.ticket.findMany({
        orderBy: {
          created_at: 'desc'
        },
        include: {
          assigned_user: {
            select: {
              username: true,  // Changed from username to Username
              first_name: true, // Added additional user fields
              last_name: true
            }
          }
        }
      });
  
      if (!tickets.length) {
        return res.status(404).json({ 
          message: 'No tickets available for export' 
        });
      }
  
      const csvData = tickets.map(ticket => ({
        'Ticket ID': ticket.id,
        'Title': ticket.title || '',
        'Status': ticket.status || '',
        'Category': ticket.category || '',
        'Priority': ticket.priority || '',
        'Customer': ticket.customer_name || '',
        'Site': ticket.site_name || '',
        'Assigned To': ticket.assigned_user?.Username || '', // Changed to match schema
        'Description': ticket.description || '',
        'Platform': ticket.platform || '',
        'Contact Name': ticket.contact_name || '',
        'Email': ticket.email || '',
        'Phone': ticket.phone || '',
        'Created Date': ticket.created_at ? new Date(ticket.created_at).toLocaleString() : '',
        'Updated Date': ticket.updated_at ? new Date(ticket.updated_at).toLocaleString() : '',
        'Incident Date': ticket.incident_date ? new Date(ticket.incident_date).toLocaleString() : ''
      }));
  
      const fields = Object.keys(csvData[0]);
      const parser = new Parser({ fields });
      const csv = parser.parse(csvData);
  
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=tickets-${Date.now()}.csv`);
      
      return res.send(csv);
  
    } catch (error) {
      console.error('Export error:', error);
      return res.status(500).json({
        error: 'Failed to export tickets',
        details: error.message
      });
    }
  };

  exports.getCommentsForTicket = async (req, res) => {
    try {
      console.log('Request Params:', req.params); // Log the request parameters
      const ticketId = parseInt(req.params.id);
      
      if (isNaN(ticketId)) {
        return res.status(400).json({ 
          error: 'Invalid ticket ID format' 
        });
      }
  
      const comments = await prisma.comment.findMany({
        where: {
          ticket_id: ticketId  // Matches schema field name
        },
        include: {
          user: {
            select: {
              username: true
            }
          },
          files: true,
          images: true,
          ticket: {
            select: {
              title: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });
  
      return res.status(200).json(comments);
      
    } catch (error) {
      console.error('Error fetching comments:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch comments',
        details: error.message 
      });
    }
  };


  // UPLOAD FILE

exports.getAttachmentsForTicket = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    // Assuming you have a File model in your Prisma schema
    const attachments = await prisma.File.findMany({
      where: {
        ticket_id: ticketId,
      },
    });
    res.status(200).json(attachments);
  } catch (error) {
    console.error('Error getting attachments for the ticket:', error);
    res.status(500).json({ error: 'Error fetching attachments for the ticket.' });
  }
};

exports.uploadFile = async (req, res) => {
  try {
    // Log the incoming request to help with debugging
    console.log('Received request:', req.files, req.params.id);

    // Ensure files is an array, handle single file uploads as well
    const files = Array.isArray(req.files?.files) ? req.files.files : [req.files?.files];
    
    // Validate ticketId
    const ticketId = parseInt(req.params.id);
    if (isNaN(ticketId)) {
      return res.status(400).json({ message: 'Invalid Ticket ID.' });
    }

    // Ensure that files are provided
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files provided.' });
    }

    // Azure Storage Setup
    const blobServiceClient = BlobServiceClient.fromConnectionString('DefaultEndpointsProtocol=https;AccountName=ehelpdeskstorage;AccountKey=imH5j/DMxOnA/NLueqxKQLbpgW/Eim95pCTxvMd+Q4VT1AyZHy7W6VGvxZ9YEyLc2adddXV5lEA6+AStl7GKig==;EndpointSuffix=core.windows.net');
    const containerClient = blobServiceClient.getContainerClient('ehelpdesk');

    const azureStorageUrls = [];

    // Iterate through the array of files and upload them
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Ensure file has necessary attributes
      if (!file || !file.name || !file.data) {
        console.error('Invalid file data:', file);
        return res.status(400).json({ message: 'Invalid file data.' });
      }

      const blobName = `${uuidv4()}_${file.name}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Upload the file to Azure Storage
      await blockBlobClient.uploadData(file.data, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype || 'application/octet-stream', // Default mimetype fallback
        },
      });

      const azureStorageUrl = blockBlobClient.url;
      azureStorageUrls.push(azureStorageUrl);

      // Create a new File entry in the database
      try {
        await prisma.File.create({
          data: {
            url: azureStorageUrl,
            TicketID: ticketId,
            name: file.name || 'Unnamed File', // Fallback in case file name is missing
          },
        });
      } catch (dbError) {
        console.error('Error saving file to the database:', dbError);
        return res.status(500).json({ message: 'Error saving file to the database.' });
      }
    }

    // Respond with success and the URLs of the uploaded files
    res.status(200).json({
      message: 'Files uploaded successfully.',
      azureStorageUrls,
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ message: 'Internal server error uploading files.' });
  }
};

exports.deleteAttachment = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const attachmentId = parseInt(req.params.attachmentId);

    console.log('Request object:', req);
    console.log('ticketId:', ticketId);
    console.log('attachmentId:', attachmentId);

    if (isNaN(attachmentId)) {
      return res.status(400).json({ error: 'Invalid attachmentId' });
    }

    // Assuming you have a File model in your Prisma schema
    const deletedAttachment = await prisma.File.findUnique({
      where: {
        IDFile: attachmentId,
        TicketID: ticketId,
      },
    });

    if (!deletedAttachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Azure Storage Setup
    const blobServiceClient = BlobServiceClient.fromConnectionString('DefaultEndpointsProtocol=https;AccountName=ehelpdeskstorage;AccountKey=imH5j/DMxOnA/NLueqxKQLbpgW/Eim95pCTxvMd+Q4VT1AyZHy7W6VGvxZ9YEyLc2adddXV5lEA6+AStl7GKig==;EndpointSuffix=core.windows.net');
    const containerClient = blobServiceClient.getContainerClient('ehelpdesk');

    // Extract the blob name from the URL
    const blobUrlParts = deletedAttachment.url.split('/');
    const blobName = decodeURIComponent(blobUrlParts[blobUrlParts.length - 1]);

    // Log the blob URL and name for debugging
    console.log('Blob URL:', deletedAttachment.url);
    console.log('Blob Name:', blobName);

    // Retry mechanism with a maximum of 3 attempts
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // Delete the blob from Azure Storage
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.delete();

        // Delete the attachment record from your database
        await prisma.File.delete({
          where: {
            IDFile: attachmentId,
            TicketID: ticketId,
          },
        });

        console.log('Deleted attachment:', deletedAttachment);
        res.status(204).send(); // 204 No Content: Successful deletion
        return; // Exit the function if successful
      } catch (error) {
        console.error('Error deleting attachment. Retrying...', error);
        retries++;
      }
    }

    console.error('Max retries reached. Unable to delete attachment.');
    res.status(500).json({ error: 'Internal Server Error' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


const { Client } = require('pg');
exports.getGmptCodesBySite = async (req, res) => {
  const { site_id } = req.query;

  if (!site_id) {
    return res.status(400).json({ error: 'Missing site_id' });
  }

  const fleetiq = new Client({
    host: 'db-fleetiq-encrypt-01.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'multi',
    user: 'gmtp',
    password: 'MUVQcHz2DqZGHvZh'
  })
  const client = new Client(fleetiq);
  try {
    await client.connect();

    console.log("Conexión a la base de datos establecida");
    
    const query = `
      SELECT "V"."VEHICLE_ID"
      FROM "FMS_VEHICLE_MST" "V"
      JOIN "FMS_USR_VEHICLE_REL" "R" ON "V"."VEHICLE_CD" = "R"."VEHICLE_CD"
      WHERE "R"."LOC_CD" = $1;
    `;
    const result = await client.query(query, [site_id]);
    const codes = result.rows.map(row => row.VEHICLE_ID); // Make sure column name is lowercase
    res.json(codes);
  } catch (err) {
    console.error('Error fetching GMPT codes:', err.message);
    res.status(500).json({ error: 'Internal error fetching GMPT codes' });
  } finally {
    await client.end();
  }
  console.log("Solicitud recibida en /gmpt-codes con site_id:", req.query.site_id);
};


exports.getTicket = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);

    if (isNaN(ticketId)) {
      return res.status(400).json({ 
        error: 'Invalid ticket ID format' 
      });
    }

    const ticket = await prisma.ticket.findUnique({
      where: {
        id: ticketId
      },
      include: {
        assigned_user: {
          select: {
            id: true,
            username: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        jira_ticket: {
          select: {
            id: true,
            key: true,
            status: true,
            description: true,
            project_name: true
          }
        },
        comments: {
          include: {
            user: {
              select: {
                username: true,
                email: true
              }
            },
            files: true,
            images: true
          },
          orderBy: {
            created_at: 'desc'
          }
        },
        files: true,
        images: true
      }
    });

    if (!ticket) {
      return res.status(404).json({ 
        error: `Ticket with ID ${ticketId} not found` 
      });
    }

    // Format dates for frontend
    const formattedTicket = {
      ...ticket,
      created_at: ticket.created_at.toISOString(),
      updated_at: ticket.updated_at.toISOString(),
      incident_date: ticket.incident_date?.toISOString() || null,
      comments: ticket.comments.map(comment => ({
        ...comment,
        created_at: comment.created_at.toISOString(),
        updated_at: comment.updated_at.toISOString()
      }))
    };

    return res.status(200).json(formattedTicket);

  } catch (error) {
    console.error('Error fetching ticket:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch ticket',
      details: error.message 
    });
  }
};