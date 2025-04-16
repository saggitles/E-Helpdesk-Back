const auth0 = require('auth0');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');
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


// TICKETS

exports.getTicketsPagination = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 8; // Número de tickets por página

  try {
    // Calcular cuántos registros "saltar" basado en la página actual
    const skip = (page - 1) * limit;

    const tickets = await prisma.ticket.findMany({
      skip: skip,
      take: limit,
      include: {
        Customer: {
          select: {
            CustomerName: true
          }
        },
        AssignedUser: {
          select: {
            username: true
          }
        }
      }
    });

    // Contar el total de tickets para la paginación
    const totalTickets = await prisma.ticket.count();
    res.status(200).json({
      tickets,
      totalPages: Math.ceil(totalTickets / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error getting ticket list:', error);
    res.status(500).json({ message: 'Internal server error getting ticket list.' });
  }
};







exports.getAssignedUserForTicket = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);

    if (isNaN(ticketId)) {
      return res.status(400).json({ 
        error: 'Invalid ticket ID format' 
      });
    }

    const ticket = await prisma.ticket.findUnique({
      where: {
        id: ticketId
      },
      include: {  // Changed from select to include for relations
        assigned_user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ 
        error: 'Ticket not found' 
      });
    }

    const assignedUserId = ticket.assigned_user?.id || null;

    return res.status(200).json({ assigneeId: assignedUserId });

  } catch (error) {
    console.error('Error getting assigned user:', error);
    return res.status(500).json({ 
      error: 'Failed to get assigned user',
      details: error.message 
    });
  }
};

exports.createTicket = async (req, res) => {
  console.log('Request Body:', req.body); // Ver contenido del body
  try {
    // Convert date string to ISO DateTime
    const incidentDate = req.body.incident_date ? 
      new Date(req.body.incident_date).toISOString() : 
      null;

    const ticket = await prisma.ticket.create({
      data: {
        title: req.body.title,
        site_id: parseInt(req.body.site_id),
        site_name: req.body.site_name,
        contact_name: req.body.contact_name,
        priority: req.body.priority,
        status: req.body.status,
        category: req.body.category,
        customer_name: req.body.customer_name,
        customer_id: parseInt(req.body.customer_id),
        description: req.body.description,
        incident_date: incidentDate,
        drivers_name: req.body.drivers_name || "",
        vehicle_id: req.body.vehicle_id || "",
        supported: req.body.supported,
        email: req.body.email,
        platform: req.body.platform,
        solution: req.body.solution || "",
        phone: req.body.phone || ""
      }
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Ticket creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create ticket',
      details: error.message 
    });
  }
};


exports.updateTicket = async (req, res) => {
  console.log('Request Body:', req.body); // Ver contenido del body
  let ticketId = req.params.id;
  const { JiraTicketID, ...updatedFields } = req.body;

  // Parse the ticket ID if it's a number.
  if (!isNaN(ticketId)) {
    ticketId = parseInt(ticketId, 10);
  }

  // Handle JiraTicketID if provided.
  if (JiraTicketID !== undefined) {
    updatedFields.JiraTicket = JiraTicketID === null
      ? { disconnect: true }
      : { connect: { IDJiraTicket: parseInt(JiraTicketID, 10) } };
  }

  // Ensure `openSince` is not included in the update.
  delete updatedFields.openSince;
  delete updatedFields.createdAt;

  try {
    console.log('Updating ticket with data:', updatedFields); // Ver los datos antes de la actualización
    const result = await prisma.ticket.update({
      where: { IDTicket: ticketId },
      data: updatedFields,
    });

    console.log('Ticket updated successfully:', result); // Ver el resultado de la actualización
    res.json(result);
  } catch (error) {
    console.error("Error updating ticket:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

function excelSerialDateToJSDate(serial) {
  const excelEpoch = new Date(1899, 11, 30);
  const excelEpochAsUnixTimestamp = excelEpoch.getTime();
  const missingLeapYearDay = 24 * 60 * 60 * 1000;
  const daysToMs = (serial - 1) * 24 * 60 * 60 * 1000;
  return new Date(excelEpochAsUnixTimestamp + daysToMs + missingLeapYearDay);
}



// Importar excel
exports.importTickets = async (req, res) => {
  try {
    // Obtener el arreglo de tickets del cuerpo de la solicitud
    const ticketsToImport = req.body;

    // console.log("Aquí están los tickets");
    // console.log(req.body);

    // Crear los tickets en la base de datos utilizando Prisma
    const createdTickets = await Promise.allSettled(
      ticketsToImport.map(async (ticket, index) => {
        try {
          // console.log(`Creando ticket #${index + 1}`);
          const now = new Date();

          console.log("Aca esta la fecha :c")
          console.log(excelSerialDateToJSDate(ticket.createdAt))

          // Verificar si ticket.createdAt está definido antes de acceder a él
          console.log("Aca esta la fecha!")
          console.log(ticket.createdAt)
          console.log(ticket)
          const createdAtDate = ticket.createdAt ? new Date(ticket.createdAt) : now;

          // Convertir VehicleID a cadena (String) si está definido
          const vehicleIDAsString = ticket.VehicleID ? String(ticket.VehicleID) : null;

          const validComments = ticket.Comments ? String(ticket.Comments) : "";

          console.log("Aca esta la fecha de creacion: ")
          console.log(createdAtDate)
       

          const createdTicket = await prisma.ticket.create({
            data: {
              ...ticket,
              VehicleID: vehicleIDAsString,
              createdAt: createdAtDate,
              updatedAt: createdAtDate,
              Comments: {
                create:  {Content: validComments} 
              }
            },
          });
          
          return { status: 'fulfilled', value: createdTicket };
        } catch (error) {
          console.error(`Error al crear ticket #${index + 1}:`, error.message);
          return { status: 'rejected', reason: error.message };
        }
      })
    );

    // Filtrar solo los tickets creados exitosamente
    const fulfilledTickets = createdTickets
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    // Responder con los tickets creados exitosamente y los errores
    res.status(201).json({
      createdTickets: fulfilledTickets,
      errors: createdTickets.filter((result) => result.status === 'rejected'),
    });
  } catch (error) {
    console.error('Error al importar tickets:', error);
    res.status(500).json({ error: 'Error al importar tickets' });
  }
};




// Update only assignUser

// exports.assignUserToTicket = async (req, res) => {
//   const ticketId = req.params.id;
//   const assignedUserId = req.body.AssignedUserID;
//   // Convertir ticketId a número si es necesario
//   const parsedTicketId = !isNaN(ticketId) ? parseInt(ticketId, 10) : null;
//   try {
//     if (parsedTicketId === null) {
//       throw new Error("Invalid ticket ID");
//     }
//     // Actualizar solo el campo AssignedUserID
//     const result = await prisma.ticket.update({
//       where: { IDTicket: parsedTicketId },
//       data: {
//         AssignedUserID: assignedUserId,
//       },
//     });
//     res.json(result);
//   } catch (error) {
//     console.error("Error assigning user to ticket:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };


exports.deleteTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;

    // Eliminar comentarios relacionados
    await prisma.comment.deleteMany({
      where: { TicketID: parseInt(ticketId) }
    });

    // Eliminar archivos relacionados
    await prisma.file.deleteMany({
      where: { TicketID: parseInt(ticketId) }
    });

    // Eliminar imágenes relacionadas
    await prisma.image.deleteMany({
      where: { TicketID: parseInt(ticketId) }
    });

    // Finalmente, eliminar el ticket
    await prisma.ticket.delete({
      where: { IDTicket: parseInt(ticketId) }
    });

    res.status(200).send({ message: 'Ticket eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Error al eliminar el ticket' });
  }
};



// COMMENTS



exports.createComment = async (req, res) => {
  try {
    console.log('Request Body:', req.body);
    const { Content, TicketID } = req.body;

    // Input validation
    if (!Content || !TicketID) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Content and TicketID are required'
      });
    }

    // Get user from Auth0
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ error: 'Access token missing' });
    }

    // Get Auth0 user info
    const userInfoResponse = await axios.get(
      'https://dev-so03q0yu6n6ltwg2.us.auth0.com/userinfo',
      { headers: { Authorization: token } }
    );
    console.log('Auth0 User:', userInfoResponse.data);

    // Get backend user
    const userResponse = await axios.get(
      `https://ci-ehelpdesk-be.azurewebsites.net/api/users/?email=${userInfoResponse.data.email}`,
      { headers: { Authorization: token } }
    );
    console.log('Backend User:', userResponse.data);

    if (!userResponse.data?.[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    // First verify user exists in database
    const userId = parseInt(userResponse.data[0].IDUser);
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      // Create user if doesn't exist
      await prisma.user.create({
        data: {
          id: userId,
          email: userInfoResponse.data.email,
          username: userResponse.data[0].Username || userInfoResponse.data.email
        }
      });
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        content: Content,
        ticket_id: parseInt(TicketID),
        user_id: userId
      },
      include: {
        user: {
          select: {
            username: true,
            email: true
          }
        }
      }
    });

    return res.status(201).json(comment);

  } catch (error) {
    console.error('Comment creation error:', error);
    return res.status(500).json({
      error: 'Failed to create comment',
      details: error.message
    });
  }
};




exports.getComments = async (req, res) => {
  try {
    const comments = await prisma.comment.findMany();
    res.status(200).json(comments);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los comentarios' });
  }
};

exports.getComment = async (req, res) => {
  const { id } = req.params;
  
  try {
    const comment = await prisma.comment.findUnique({
      where: {
        IDComment: Number(id),
      },
    });

    if (comment) {
      res.status(200).json(comment);
    } else {
      res.status(404).json({ error: 'Comentario no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el comentario' });
  }
};

exports.updateComment = async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;
  
  try {
    const updatedComment = await prisma.comment.update({
      where: {
        IDComment: Number(id),
      },
      data: updatedData,
    });

    res.status(200).json(updatedComment);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el comentario' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);

    if (isNaN(commentId)) {
      return res.status(400).json({ 
        error: 'Invalid comment ID format' 
      });
    }

    // Check if comment exists
    const comment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      return res.status(404).json({ 
        error: `Comment with ID ${commentId} not found` 
      });
    }

    // Delete any associated files/images first
    await prisma.file.deleteMany({
      where: { comment_id: commentId }
    });

    await prisma.image.deleteMany({
      where: { comment_id: commentId }
    });

    // Delete the comment
    await prisma.comment.delete({
      where: { id: commentId }
    });

    return res.status(200).json({ 
      message: 'Comment deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting comment:', error);
    return res.status(500).json({
      error: 'Failed to delete comment',
      details: error.message
    });
  }
};




// USERS

exports.getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    console.error('Error getting list of users:', error);
    res.status(500).json({ message: 'Internal server error getting user list.' });
  }
};



// exports.getUsers = async (req, res) => {
//   try {
//     const { email } = req.query;

//     // If email is provided, filter users by email
//     if (email) {
//       const users = await prisma.user.findMany({
//         where: {
//           Email: email.toLowerCase(),  // Ensure case-insensitive comparison
//         },
//       });

//       return res.json(users);
//     }

//     // If no email is provided, return all users
//     const users = await prisma.user.findMany();
//     return res.json(users);
//   } catch (error) {
//     console.error('Error getting list of users:', error);
//     return res.status(500).json({ message: 'Internal server error getting user list.', email });
//   }
// };

exports.getUser = async (req, res) => {
  const userId = parseInt(req.params.id, 10); // Convert id to integer

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ message: 'Internal server error getting user.' });
  }
};

exports.getRolesForUser = async (req, res) => {
  const userId = parseInt(req.params.userId);

  try {
    // Check if the user exists
    const user = await prisma.user.findUnique({
      where: {
        IDUser: userId,
      },
    });

    console.log('User:', user);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check if the user has a UserRoleID
    if (user.UserRoleID !== null) {
      // Find the corresponding UserRole based on UserRoleID
      const userRole = await prisma.userRole.findUnique({
        where: {
          IDRole: user.UserRoleID,
        },
      });

      if (userRole) {
        // Extract roles from the UserRole
        const roles = userRole.RoleName || [];

        console.log('Roles:', roles);

        return res.json(roles);
      }
    }

    // If UserRoleID is null or corresponding UserRole is not found, return an empty array
    console.log('Roles: []');
    return res.json([]);
  } catch (error) {
    console.error('Error getting user roles:', error);
    res.status(500).json({ message: 'Internal server error getting user roles.' });
  }
};

exports.createUser = async (req, res) => {
  const { username, first_name, last_name, email, user_role } = req.body;

  try {
    // Create the user
    const newUser = await prisma.user.create({
      data: {
        username,
        first_name,
        last_name,
        email,
      },
    });
 
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal server error creating user.' });
  }
};

exports.updateUser = async (req, res) => {
  const userId = parseInt(req.params.id);
  console.log(userId, 'userID')
  try {
    // Check if the user exists before attempting to update
    const existingUser = await prisma.user.findUnique({
      where: {
        IDUser: userId,
      },
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // User exists, proceed with updating
    const { Username, FirstName, LastName, Email, IoTAccessToken, UserRoleID } = req.body;

    const updatedUser = await prisma.user.update({
      where: {
        IDUser: userId,
      },
      data: {
        IDUser: userId,
        Username,
        FirstName,
        LastName,
        Email,
        IoTAccessToken,
        UserRoleID,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error updating user.' });
  }
};


exports.deleteUser = async (req, res) => {
  const userId = parseInt(req.params.id);

  try {
    // Check if the user exists before attempting to delete
    const existingUser = await prisma.user.findUnique({
      where: {
        IDUser: userId,
      },
    });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // User exists, proceed with deletion
    await prisma.user.delete({
      where: {
        IDUser: userId,
      },
    });

    res.status(204).json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error deleting user.' });
  }
};

exports.assignUserToUserRole = async (req, res) => {
  const userId = req.params.id;
  const roleName = req.body.RoleName;

  // Convert userId to a number if necessary
  const parsedUserId = !isNaN(userId) ? parseInt(userId, 10) : null;

  try {
    if (parsedUserId === null) {
      throw new Error("Invalid user ID");
    }

    // Fetch existing roles based on the provided RoleName array
    const existingRoles = await prisma.userRole.findMany({
      where: {
        RoleName: {
          equals: roleName,
        },
      },
    });

    let roleId;
    
    if (existingRoles.length > 0) {
      // Roles with the given RoleName already exist, use their IDs
      roleId = existingRoles.map(role => role.IDRole);
    } else {
      // Create new roles with the given RoleName array
      const newRoles = await prisma.userRole.createMany({
        data: [{
          RoleName: roleName,
        }],
      });
    
    }
    const intRoleId = roleId.reduce((accum, digit) => (accum * 10) + digit, 0)

    // Update the user's UserRoleID to associate with the created or existing roles
    await prisma.user.update({
      where: { IDUser: parsedUserId },
      data: {
        UserRoleID: intRoleId,
      },
    });
    console.log(roleId,"roleId")

    res.json({ success: true, message: 'User successfully assigned to user role.' });
  } catch (error) {
    console.error("Error assigning user to user role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getRoles = async (req, res) => {
  try {
    const roleName = req.query.roleName;
    console.log('Query roleName:', roleName); // Log the incoming role name

    let roles;

    if (roleName) {
      // If roleName is provided, filter roles by checking if the RoleName array contains the given roleName
      roles = await prisma.userRole.findMany({
        where: {
          RoleName: {
            has: roleName, // Use 'has' to check if the array contains the roleName
          },
        },
      });
    } else {
      // If roleName is not provided, get all roles
      roles = await prisma.userRole.findMany();
    }

    console.log('Roles found:', roles); // Log the found roles

    res.json(roles);
  } catch (error) {
    console.error('Error getting list of user roles:', error);
    res.status(500).json({ message: 'Internal server error getting list of user roles.' });
  }
};

exports.getRoleByID = async (req, res) => {
  const roleId = parseInt(req.params.id);

  try {
    const role = await prisma.UserRole.findUnique({
      where: {
        IDRole: roleId,
      },
    });

    if (!role) {
      return res.status(404).json({ message: 'Role not found.' });
    }

    res.json(role);
  } catch (error) {
    console.error('Error getting user role by ID:', error);
    res.status(500).json({ message: 'Internal server error getting user role by ID.' });
  }
};

exports.createRole = async (req, res) => {
  const { RoleName } = req.body;

  try {
    const newRole = await prisma.UserRole.create({
      data: {
        RoleName: RoleName,
      },
    });

    res.status(201).json(newRole);
  } catch (error) {
    console.error('Error creating user role:', error);

    // Check if the error is due to a unique constraint violation
    if (error.code === 'P2002' && error.meta?.target?.[0] === 'RoleName') {
      return res.status(400).json({ message: 'Role with this name already exists.' });
    }

    res.status(500).json({ message: 'Internal server error creating user role.' });
  }
};

exports.deleteRole = async (req, res) => {
  const roleId = req.params.id; // Assuming the role ID is passed as a parameter in the URL

  try {
    // Check if the role exists
    const existingRole = await prisma.UserRole.findUnique({
      where: {
        id: roleId,
      },
    });

    if (!existingRole) {
      return res.status(404).json({ message: 'Role not found.' });
    }

    // Delete the role
    await prisma.UserRole.delete({
      where: {
        id: roleId,
      },
    });

    res.status(204).send(); // Respond with a 204 No Content status for successful deletion
  } catch (error) {
    console.error('Error deleting user role:', error);
    res.status(500).json({ message: 'Internal server error deleting user role.' });
  }
};




// ---- Logic ---

exports.getUsersInformation = async (req, res) =>{
  

}


// Assuming you're using Prisma for DB interaction




// exports.uploadFile = async (req, res) => {
//   try {
//     const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files]; // Ensure files is an array
//     const ticketId = parseInt(req.params.id);

//     // Azure Storage Setup
    // const blobServiceClient = BlobServiceClient.fromConnectionString('DefaultEndpointsProtocol=https;AccountName=ehelpdeskstorage;AccountKey=On1V3JznJjE9t0+b+w9WtCRiFKjKeSO1oZ7D652YOcOUNZQyvzibgs8cJb2s7cBhd8KgVHRLTiUl+AStkaqwWw==;EndpointSuffix=core.windows.net');
    // const containerClient = blobServiceClient.getContainerClient('ehelpdesk');

//     // Iterate through the array of files
//     const azureStorageUrls = [];

//     for (let i = 0; i < files.length; i++) {
//       const file = files[i];

//       // Create a unique name for the blob using a GUID or any other method
//       const blobName = `${uuidv4()}_${file.name}`;
//       const blockBlobClient = containerClient.getBlockBlobClient(blobName);

//       // Upload file to Azure Storage directly
//       await blockBlobClient.uploadData(file.data, {
//         blobHTTPHeaders: {
//           blobContentType: file.mimetype,
//         },
//       });

//       // Construct the Azure Storage URL
//       const azureStorageUrl = blockBlobClient.url;
//       azureStorageUrls.push(azureStorageUrl);

//       // Create a new File entry with the associated TicketID
//       await prisma.File.create({
//         data: {
//           url: azureStorageUrl,
//           TicketID: ticketId,
//           name: file.name
//         },
//       });
//     }

//     res.json({
//       message: 'Files uploaded successfully.',
//       azureStorageUrls,
//     });
//   } catch (error) {
//     console.error('Error uploading files:', error);
//     res.status(500).json({ message: 'Internal server error uploading files.' });
//   }
// };





//  Informacion del JiraTicket!

exports.getJiraTicketById = async (req, res) => {
  const ticketId = parseInt(req.params.id);

  try {
    const jiraTicket = await prisma.jiraTicket.findUnique({
      where: {
        IDJiraTicket: ticketId,
      },
    });

    if (!jiraTicket) {
      return res.status(404).json({ message: 'JiraTicket not found.' });
    }

    res.json(jiraTicket);
  } catch (error) {
    console.error('Error getting JiraTicket by ID:', error);
    res.status(500).json({ message: 'Internal server error getting JiraTicket by ID.' });
  }
};



// ----- JIRA -----

exports.postJira = async (req, res) => {
  try {
    const { title, description, key, idTicket } = req.body;
    const apiEndpoint = 'https://collectiveintelligence.atlassian.net/rest/api/2/issue/';
    const jiraUsername = 'e-helpdesk@tolintelligence.com';
    const jiraToken = 'ATATT3xFfGF0Ni1Rnxi1Z9aOh6JDOAe6xhvdL02g-OWYXt_84M9SLCyYgb477gZl2rHic1jsnQVWoQw05bzyXj8Bx__lrsYLs11rCX9bUjyMAQzuuaJd2E9RCLpA2A7x_299vipHW2v6a3_XRNZD_4DtXJdMD7l789Q7XlSQQ0MBxYH05FVXkUI=1FEB5A54';
    const authToken = Buffer.from(`${jiraUsername}:${jiraToken}`).toString('base64');
    
    let requestData = {
      fields: {
        project: { key },
        summary: 'EHD ' + title,
        description,
        issuetype: { name: 'Bug' },
      }
    };

    const createResponse = await axios.post(apiEndpoint, requestData, {
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    const ticketDetailsResponse = await axios.get(createResponse.data.self, {
      headers: {
        Authorization: `Basic ${authToken}`,
      },
    });

    // Crear un nuevo JiraTicket
    const newJiraTicket = await prisma.jiraTicket.create({
      data: {
        key: createResponse.data.key,
        self: createResponse.data.self,
        ProjectName: ticketDetailsResponse.data.fields.project.name,
        ProjectKey: ticketDetailsResponse.data.fields.project.key,
        ProjectType: ticketDetailsResponse.data.fields.project.projectTypeKey,
        Type: ticketDetailsResponse.data.fields.issuetype.name,
        Description: ticketDetailsResponse.data.fields.description,
        Status: ticketDetailsResponse.data.fields.status.name,
        StatusCategory: ticketDetailsResponse.data.fields.status.statusCategory.name,
        CreationDate: ticketDetailsResponse.data.fields.created,
        Tickets: {
          connect: { IDTicket: idTicket } 
        }
      }
    });

    console.log('Nuevo JiraTicket creado:', newJiraTicket);
    res.status(200).json({ success: true, message: 'Jira ticket created successfully', data: newJiraTicket });
  } catch (error) {
    console.error('Error escalating to Jira:', error);
    res.status(500).json({ success: false, message: 'Error escalating to Jira', error: error.message });
  }
};

exports.getJiraIssue = async (req, res) => {
  try {
    const issueIdOrKey = req.params.issueIdOrKey;
    const apiEndpoint = `https://collectiveintelligence.atlassian.net/rest/api/2/issue/${issueIdOrKey}`;
    const jiraUsername = 'e-helpdesk@tolintelligence.com';
    const jiraToken = 'ATATT3xFfGF0Ni1Rnxi1Z9aOh6JDOAe6xhvdL02g-OWYXt_84M9SLCyYgb477gZl2rHic1jsnQVWoQw05bzyXj8Bx__lrsYLs11rCX9bUjyMAQzuuaJd2E9RCLpA2A7x_299vipHW2v6a3_XRNZD_4DtXJdMD7l789Q7XlSQQ0MBxYH05FVXkUI=1FEB5A54';
    const authToken = `Basic ${Buffer.from(`${jiraUsername}:${jiraToken}`).toString('base64')}`;

    const response = await axios.get(apiEndpoint, {
      headers: {
        Authorization: authToken,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    console.log("Jira Issue Details:", response.data);
    res.status(200).json(response.data); // Enviar los datos de la respuesta al cliente
  } catch (error) {
    console.error('Error fetching Jira Issue:', error);
    res.status(500).json({ error: error.message });
  }
};


// --- IOT --- //

exports.fetchIoTDevices = async (req, res, filterText) => {

  try {
    // Get access token from request headers
    const accessToken = req.headers.authorization.split(' ')[1];

    const fetchUser = await axios.get('https://dev-so03q0yu6n6ltwg2.us.auth0.com/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const userEmail = fetchUser.data.email;

    // Fetch the user details based on their email
    const userResponse = await axios.get(`https://ci-ehelpdesk-be-staging.azurewebsites.net/api/users/?email=${userEmail}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    
    // Extract the IoTAccessToken from the user details
    const user = userResponse.data[0]; // Assuming there's only one user with the given email
    const userToken = user.IoTAccessToken;

    console.log("userToken", userToken)
    
    // Make a POST request to fetch IoT devices
    const response = await axios.post(`https://godev.collectiveintelligence.com.au/FleetXQ-8735218d-3aeb-4563-bccb-8cdfcdf1188f/dataset/api/iothubmanager/FetchIoTDevices?_user_token=${userToken}`, { Filter: filterText });
    
    // Return the response data
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching IoT devices:', error);
    throw new Error('An error occurred while fetching IoT devices');
  }
};

exports.fetchCurrentUser = async (req, res) => {
  try {
    // Get access token from request headers
    const accessToken = req.headers.authorization.split(' ')[1];

    // Make request to Auth0 userinfo endpoint
    const response = await axios.get('https://dev-so03q0yu6n6ltwg2.us.auth0.com/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    // Return user data
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({ error: 'An error occurred while fetching user' });
  }
};

// FLEETXQ API

// exports.getVehicleDetail = async (req, res) => {
//   const { id } = req.body;
//   const accessToken = req.headers.authorization.split(' ')[1];

//     const fetchUser = await axios.get('https://dev-so03q0yu6n6ltwg2.us.auth0.com/userinfo', {
//       headers: {
//         Authorization: `Bearer ${accessToken}`
//       }
//     });

//     const userEmail = fetchUser.data.email;

//     // Fetch the user details based on their email
//     const userResponse = await axios.get(`https://ci-ehelpdesk-be-staging.azurewebsites.net/api/users/?email=${userEmail}`, {
//       headers: {
//         Authorization: `Bearer ${accessToken}`
//       }
//     });
    
//     // Extract the IoTAccessToken from the user details
//     const user = userResponse.data[0]; // Assuming there's only one user with the given email
//     const userToken = user.IoTAccessToken; // Assuming the token is sent in the headers
//     console.log("userToken", userToken)
//   const formData = new FormData();
//   formData.append('id', id);

//   try {
//     const response = await axios.post(
//       'https://godev.collectiveintelligence.com.au/fleetxq-8735218d-3aeb-4563-bccb-8cdfcdf1188f/dataset/api/ehelpdeskapi/getvehicledetail',
//       formData,
//       {
//         headers: {
//           'Content-Type': 'multipart/form-data',
//           Authorization: `Bearer ${userToken}`,
//         },
//       }
//     );
//     res.json(response.data);
//   } catch (error) {
//     console.error('Error fetching vehicle details:', error);
//     res.status(500).json({ error: 'Failed to fetch vehicle details' });
//   }
// };

exports.getVehicleDetail = async (req, res) => {
  const { id } = req.body;

  const authFormData = new FormData();
  authFormData.append('username', 'Admin');
  authFormData.append('password', 'Admin');

  // Make the API call to the authentication endpoint
  const authEndpoint = 'https://godev.collectiveintelligence.com.au/FleetXQ-8735218d-3aeb-4563-bccb-8cdfcdf1188f/dataset/api/gosecurityprovider/authenticate';

  try {

    // Authenticate the user and get the access token
    const authResponse = await axios.post(authEndpoint, authFormData, {
      headers: {
        'Content-Type': 'multipart/form-data', // Ensure to set this header for multipart/form-data
      }
    });
    const accessToken = authResponse.data;

    // Create form data for vehicle detail request
    const formData = new FormData();
    formData.append('id', id);

    // Fetch vehicle details using the obtained token
    const response = await axios.post(
      'https://godev.collectiveintelligence.com.au/fleetxq-8735218d-3aeb-4563-bccb-8cdfcdf1188f/dataset/api/ehelpdeskapi/getvehicledetail',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching vehicle details:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle details' });
  }
};


exports.getWelcome = async (req, res) => {
  const welcomeMessage = { message: "Hello World!" };
  return res.json(welcomeMessage);
};

// const pool = require('./db');




const { Client } = require('pg');
const { Console } = require('console');
const { PassThrough } = require('stream');

// Gmtpid
exports.fleetiq = async (req, res) => {
  const vehicleIdParam = req.query.vehicleId; 
  const client = new Client({
    host: 'db-fleetiq-encrypt.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'multi',
    user: 'gmtp',
    password: 'MUVQcHz2DqZGHvZh'
  });

  try {
    await client.connect();
    const vehicleQuery = `
      SELECT "VEHICLE_CD"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_ID" = $1
    `;
    const vehicleRes = await client.query(vehicleQuery, [vehicleIdParam]);
    const cd = vehicleRes.rows.length > 0 ? vehicleRes.rows[0].VEHICLE_CD : null;

    if (!cd) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const generalInformationQuery = `
      SELECT 
        v."VEHICLE_ID", 
        v."SERIAL_NO", 
        v."full_lockout_enabled", 
        v."vor_setting", 
        v."ON_HIRE", 
        v."HIRE_NO", 
        e."model"
      FROM 
        "public"."FMS_VEHICLE_MST" v
      JOIN 
        "public"."equipment_view" e
      ON 
        v."SERIAL_NO" = e."serial_no"
      WHERE 
        v."VEHICLE_CD" = $1
    `;
    const generalInformationRes = await client.query(generalInformationQuery, [cd]);

    const vehicleIdResult = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].VEHICLE_ID : null;
    const HireNo = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].HIRE_NO : null;
    const SERIAL_NO = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].SERIAL_NO : null;
    const model = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].model : null;
    const IsVOR = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].vor_setting : null;
    const full_lockout_enabled = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].full_lockout_enabled : null;


    
    // Viene la pagina Idle Setting


    const IdleSettingQuery = `SELECT 
                          "seat_idle", 
                          "idle_timer", 
                          "survey_timeout", 
                          "VEHICLE_ID", 
                          "VEHICLE_CD", 
                          "canrule"
                      FROM "public"."FMS_VEHICLE_MST" 
                      WHERE "VEHICLE_ID" = $1`


    const IdleSetting = await client.query(IdleSettingQuery, [vehicleIdParam]);

    const IdleTimeoutEnabled = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].idle_timer : null;
    const IdleTimeoutTimer = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].seat_idle : null;
    const IsCanBus = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].canrule : null


    // Impact Setting

    const impactSettingQuery = `SELECT 
                                "FSSS_BASE", 
                                "IMPACT_LOCKOUT",
                                "FSSSMULTI"
                            FROM "public"."FMS_VEHICLE_MST" 
                            WHERE "VEHICLE_ID" = $1`;

     const impactSetting = await client.query(impactSettingQuery, [vehicleIdParam]);      
     
    const FSSS_BASE = impactSetting.rows.length > 0 ? impactSetting.rows[0].FSSS_BASE : null;
    const IMPACT_LOCKOUT = impactSetting.rows.length > 0 ? impactSetting.rows[0].IMPACT_LOCKOUT : null;
    const FSSSMULTI = impactSetting.rows.length > 0 ? impactSetting.rows[0].FSSSMULTI : null;





    // Supervisor list

    const supervisorListQuery = `SELECT 
                                  u."USER_CD", 
                                  d."driver_name", 
                                  dept."DEPT_NAME", 
                                  loc."NAME", 
                                  MAX(u."CARD_ID") AS "CARD_ID", 
                                  MAX(u."CARD_PREFIX") AS "CARD_PREFIX", 
                                  MAX(u."DRIVER_ID") AS "DRIVER_ID"
                              FROM "public"."FMS_USR_MST" u
                              JOIN "public"."FMS_USER_DEPT_REL" r ON u."USER_CD" = r."USER_CD"
                              JOIN "public"."driver_list" d ON r."USER_CD" = d."user_cd"
                              JOIN "public"."FMS_LOC_MST" loc ON r."LOC_CD" = loc."LOCATION_CD"
                              JOIN "public"."FMS_DEPT_MST" dept ON r."DEPT_CD" = dept."DEPT_CD"
                              WHERE d."user_cd" IN (
                                  SELECT DISTINCT "user_cd"
                                  FROM "public"."driver_list"
                                  WHERE "driver_name" IN (
                                      SELECT "master_name"
                                      FROM "public"."master_list"
                                      WHERE "gmtp_id" = $1
                                  )
                              )
                              GROUP BY u."USER_CD", d."driver_name", dept."DEPT_NAME", loc."NAME"; `

    const supervisorsList = await client.query(supervisorListQuery, [vehicleIdParam]);

    const supervisors = supervisorsList.rows.length > 0 ? supervisorsList.rows : [];


    // Preopcheck

    const preop = `WITH vehicle_data AS (
                  SELECT "VEHICLE_TYPE_CD", "VEHICLE_CD"
                  FROM "public"."FMS_VEHICLE_MST"
                  WHERE "VEHICLE_ID" = $1
              ),
              user_vehicle_data AS (
                  SELECT "USER_CD", "LOC_CD", "DEPT_CD"
                  FROM "public"."FMS_USR_VEHICLE_REL"
                  WHERE "VEHICLE_CD" = (SELECT "VEHICLE_CD" FROM vehicle_data)
              )
              SELECT *
              FROM "public"."FMS_OPCHK_QUEST_MST"
              WHERE "VEH_TYP_CD" = (SELECT "VEHICLE_TYPE_CD" FROM vehicle_data)
                AND ("USER_CD", "LOC_CD", "DEPT_CD") IN (
                  SELECT "USER_CD", "LOC_CD", "DEPT_CD"
                  FROM user_vehicle_data
              );`

    const preopCheck = await client.query(preop, [vehicleIdParam]);


    const preops = preopCheck .rows.length > 0 ? preopCheck .rows : [];




    console.log(vehicleIdResult);

    const driverQuery = `
      SELECT 
      r."USER_CD", 
      d."driver_name", 
      dept."DEPT_NAME", 
      loc."NAME", 
      usr."CARD_ID", 
      usr."CARD_PREFIX", 
      usr."DRIVER_ID"
      FROM "public"."FMS_USER_DEPT_REL" r
      JOIN "public"."driver_list" d ON r."USER_CD" = d."user_cd"
      JOIN "public"."FMS_LOC_MST" loc ON r."LOC_CD" = loc."LOCATION_CD"
      JOIN "public"."FMS_DEPT_MST" dept ON r."DEPT_CD" = dept."DEPT_CD"
      JOIN "public"."FMS_USR_MST" usr ON r."USER_CD" = usr."USER_CD"
      WHERE d."gmtp_id" = $1
    `;
    const driverRes = await client.query(driverQuery, [vehicleIdResult]);
    const DriverList = driverRes.rows;

    const masterQuery = `
      SELECT "gmtp_id", "master_name", "slot_no", "weigand"
      FROM "public"."master_list"
      WHERE "gmtp_id" = $1
    `;
    const masterRes = await client.query(masterQuery, [vehicleIdResult]);
    const supervisorList = masterRes.rows;

    const idleSettingQuery = `
      SELECT "seat_idle"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const idleSettingRes = await client.query(idleSettingQuery, [cd]);
    const idleSetting = idleSettingRes.rows.length > 0 ? idleSettingRes.rows[0].seat_idle : null;

    const checklistQuery1 = `
      SELECT "VEHICLE_TYPE_CD", "USER_CD", r."LOC_CD", "DEPT_CD"
      FROM "public"."FMS_VEHICLE_MST" v
      JOIN "public"."FMS_USR_VEHICLE_REL" r ON v."VEHICLE_CD" = r."VEHICLE_CD"
      WHERE v."VEHICLE_CD" = $1
    `;
    const checklistRes1 = await client.query(checklistQuery1, [cd]);
    const vehicleData = checklistRes1.rows.length > 0 ? checklistRes1.rows[0] : null;

    let checklistSetting = [];
    if (vehicleData) {
      const { VEHICLE_TYPE_CD, USER_CD, LOC_CD, DEPT_CD } = vehicleData;
      const checklistQuery2 = `
        SELECT "CHK_CD", "VEH_TYP_CD", "QUESTION", "ANS_TYP", "EXP_ANS", "CRITICAL_ANS", "EXCLUDE_RANDOM"
        FROM "public"."FMS_OPCHK_QUEST_MST"
        WHERE "VEH_TYP_CD" = $1 AND "USER_CD" = $2 AND "LOC_CD" = $3 AND "DEPT_CD" = $4
      `;
      const checklistRes2 = await client.query(checklistQuery2, [VEHICLE_TYPE_CD, USER_CD, LOC_CD, DEPT_CD]);
      checklistSetting = checklistRes2.rows;
    }

    const firmwareQuery = `
      SELECT "MK3DBG"
      FROM "public"."FMS_VER_STORE"
      WHERE "VEHICLE_CD" = $1
    `;
    const firmwareRes = await client.query(firmwareQuery, [cd]);
    const firmwareVersion = firmwareRes.rows.length > 0 ? firmwareRes.rows[0].MK3DBG : null;

    const surveyTimeoutQuery = `
      SELECT "survey_timeout"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const surveyTimeoutRes = await client.query(surveyTimeoutQuery, [cd]);
    const surveyTimeout = surveyTimeoutRes.rows.length > 0 ? surveyTimeoutRes.rows[0].survey_timeout : null;

    const lastSessionQuery = `
      SELECT "last_session"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const lastSessionRes = await client.query(lastSessionQuery, [cd]);
    const lastSession = lastSessionRes.rows.length > 0 ? lastSessionRes.rows[0].last_session : null;

    // Consulta para obtener lockout status
    const lockoutStatusQuery = `
      SELECT "lockout_code"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const lockoutStatusRes = await client.query(lockoutStatusQuery, [cd]);
    const lockoutCode = lockoutStatusRes.rows.length > 0 ? lockoutStatusRes.rows[0].lockout_code : null;

    let lockoutStatus = "Unknown";
    if (lockoutCode !== null) {
      const lockoutStatusMap = {
        0: "Unlocked",
        253: "Impact Lockout",
        252: "Question Lockout",
        251: "Critical Question Lockout",
        254: "Survey Time Out Lockout"
      };
      lockoutStatus = lockoutStatusMap[lockoutCode] || "Lockout";
    }

    return res.json({ cd, GMTP_ID: vehicleIdResult, HireNo: HireNo, Serial: SERIAL_NO, Model: model, IsVOR: IsVOR, FullLockoutEnabled: full_lockout_enabled, FullLockoutEnabled:IdleTimeoutEnabled, IdleTimeoutTimer:IdleTimeoutTimer, IsCanBus:IsCanBus, FSSS_BASE:FSSS_BASE, FSSSMULTI:FSSSMULTI, IMPACT_LOCKOUT:IMPACT_LOCKOUT, impactSetting, supervisors, supervisorsList, PreopChecklists:preops, generalInformationRes, DriverList, supervisorList, idleSetting, checklistSetting, firmwareVersion, surveyTimeout, lastSession, lockoutStatus });

  } catch (err) {
    console.error('Error executing query', err);
    return res.status(500).json({ error: 'Error executing query' });
  } finally {
    await client.end();
  }
};


// fleetIQ serial


exports.fleetiqserial = async (req, res) => {
  const serialNo = req.params.serialNo;
  const userName = req.params.userName;

  console.log(serialNo + "---" + userName);

  const client = new Client({
    host: 'db-fleetiq-encrypt.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'multi',
    user: 'gmtp',
    password: 'MUVQcHz2DqZGHvZh'
  });

  try {
    await client.connect();

    // Consulta: Obtener USER_CD basado en userName
    const userQuery = `
      SELECT "USER_CD" 
      FROM "FMS_CUST_MST" 
      WHERE "USER_NAME" = $1
    `;
    const userResult = await client.query(userQuery, [userName]);
    const userCd = userResult.rows[0]?.USER_CD;

    if (!userCd) {
      throw new Error('User not found');
    }

    console.log("USER_CD: ", userCd);
    console.log("Serial: ", serialNo)

    // Consulta: Obtener VEHICLE_CD basado en serialNo y USER_CD
    const vehicleQuery = `
      WITH user_vehicle_data AS (
        SELECT "USER_CD", "VEHICLE_CD", "LOC_CD", "DEPT_CD"
          FROM "public"."FMS_USR_VEHICLE_REL"
          WHERE "USER_CD" = $1
      )
      SELECT "VEHICLE_ID", "SERIAL_NO"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" IN (SELECT "VEHICLE_CD" FROM user_vehicle_data)
        AND "SERIAL_NO" = $2;
      `;

    console.log(userCd + " --- " + serialNo)
    const vehicleResult = await client.query(vehicleQuery, [userCd, serialNo]);


    const vehicles = vehicleResult.rows;

    if (vehicles.length === 0) {
      throw new Error('No vehicles found');
    }

    console.log("Vehicles: ", vehicles);


    // Ahora aca se debe hacer la otra peticion

    // Por ahora tomara el primer vehiculo, por el mvp

    const firstVehicleId = vehicles[0].VEHICLE_ID;


    const vehicleIdParam = firstVehicleId

    const vehicleQueryy = `
      SELECT "VEHICLE_CD"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_ID" = $1
    `;
    const vehicleRes = await client.query(vehicleQueryy, [vehicleIdParam]);
    const cd = vehicleRes.rows.length > 0 ? vehicleRes.rows[0].VEHICLE_CD : null;

    if (!cd) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const generalInformationQuery = `
      SELECT 
        v."VEHICLE_ID", 
        v."SERIAL_NO", 
        v."full_lockout_enabled", 
        v."vor_setting", 
        v."ON_HIRE", 
        v."HIRE_NO", 
        e."model"
      FROM 
        "public"."FMS_VEHICLE_MST" v
      JOIN 
        "public"."equipment_view" e
      ON 
        v."SERIAL_NO" = e."serial_no"
      WHERE 
        v."VEHICLE_CD" = $1
    `;
    const generalInformationRes = await client.query(generalInformationQuery, [cd]);

    const vehicleIdResult = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].VEHICLE_ID : null;
    const HireNo = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].HIRE_NO : null;
    const SERIAL_NO = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].SERIAL_NO : null;
    const model = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].model : null;
    const IsVOR = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].vor_setting : null;
    const full_lockout_enabled = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].full_lockout_enabled : null;


    
    // Viene la pagina Idle Setting


    const IdleSettingQuery = `SELECT 
                          "seat_idle", 
                          "idle_timer", 
                          "survey_timeout", 
                          "VEHICLE_ID", 
                          "VEHICLE_CD", 
                          "canrule"
                      FROM "public"."FMS_VEHICLE_MST" 
                      WHERE "VEHICLE_ID" = $1`


    const IdleSetting = await client.query(IdleSettingQuery, [vehicleIdParam]);

    const IdleTimeoutEnabled = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].idle_timer : null;
    const IdleTimeoutTimer = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].seat_idle : null;
    const IsCanBus = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].canrule : null


    // Impact Setting

    const impactSettingQuery = `SELECT 
                          "FSSS_BASE", 
                          "IMPACT_LOCKOUT"
                          FROM "public"."FMS_VEHICLE_MST" 
                          WHERE "VEHICLE_ID" = $1`;

     const impactSetting = await client.query(impactSettingQuery, [vehicleIdParam]);      
     
    const FSSS_BASE = impactSetting.rows.length > 0 ? impactSetting.rows[0].FSSS_BASE : null;
    const IMPACT_LOCKOUT = impactSetting.rows.length > 0 ? impactSetting.rows[0].IMPACT_LOCKOUT : null;




    // Supervisor list

    const supervisorListQuery = `SELECT 
                                  u."USER_CD", 
                                  d."driver_name", 
                                  dept."DEPT_NAME", 
                                  loc."NAME", 
                                  MAX(u."CARD_ID") AS "CARD_ID", 
                                  MAX(u."CARD_PREFIX") AS "CARD_PREFIX", 
                                  MAX(u."DRIVER_ID") AS "DRIVER_ID"
                              FROM "public"."FMS_USR_MST" u
                              JOIN "public"."FMS_USER_DEPT_REL" r ON u."USER_CD" = r."USER_CD"
                              JOIN "public"."driver_list" d ON r."USER_CD" = d."user_cd"
                              JOIN "public"."FMS_LOC_MST" loc ON r."LOC_CD" = loc."LOCATION_CD"
                              JOIN "public"."FMS_DEPT_MST" dept ON r."DEPT_CD" = dept."DEPT_CD"
                              WHERE d."user_cd" IN (
                                  SELECT DISTINCT "user_cd"
                                  FROM "public"."driver_list"
                                  WHERE "driver_name" IN (
                                      SELECT "master_name"
                                      FROM "public"."master_list"
                                      WHERE "gmtp_id" = $1
                                  )
                              )
                              GROUP BY u."USER_CD", d."driver_name", dept."DEPT_NAME", loc."NAME"; `

    const supervisorsList = await client.query(supervisorListQuery, [vehicleIdParam]);

    const supervisors = supervisorsList.rows.length > 0 ? supervisorsList.rows : [];

    console.log(vehicleIdResult);

    const driverQuery = `
      SELECT 
      r."USER_CD", 
      d."driver_name", 
      dept."DEPT_NAME", 
      loc."NAME", 
      usr."CARD_ID", 
      usr."CARD_PREFIX", 
      usr."DRIVER_ID"
      FROM "public"."FMS_USER_DEPT_REL" r
      JOIN "public"."driver_list" d ON r."USER_CD" = d."user_cd"
      JOIN "public"."FMS_LOC_MST" loc ON r."LOC_CD" = loc."LOCATION_CD"
      JOIN "public"."FMS_DEPT_MST" dept ON r."DEPT_CD" = dept."DEPT_CD"
      JOIN "public"."FMS_USR_MST" usr ON r."USER_CD" = usr."USER_CD"
      WHERE d."gmtp_id" = $1
    `;
    const driverRes = await client.query(driverQuery, [vehicleIdResult]);
    const DriverList = driverRes.rows;

    const masterQuery = `
      SELECT "gmtp_id", "master_name", "slot_no", "weigand"
      FROM "public"."master_list"
      WHERE "gmtp_id" = $1
    `;
    const masterRes = await client.query(masterQuery, [vehicleIdResult]);
    const supervisorList = masterRes.rows;

    const idleSettingQuery = `
      SELECT "seat_idle"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const idleSettingRes = await client.query(idleSettingQuery, [cd]);
    const idleSetting = idleSettingRes.rows.length > 0 ? idleSettingRes.rows[0].seat_idle : null;

    const checklistQuery1 = `
      SELECT "VEHICLE_TYPE_CD", "USER_CD", r."LOC_CD", "DEPT_CD"
      FROM "public"."FMS_VEHICLE_MST" v
      JOIN "public"."FMS_USR_VEHICLE_REL" r ON v."VEHICLE_CD" = r."VEHICLE_CD"
      WHERE v."VEHICLE_CD" = $1
    `;
    const checklistRes1 = await client.query(checklistQuery1, [cd]);
    const vehicleData = checklistRes1.rows.length > 0 ? checklistRes1.rows[0] : null;

    let checklistSetting = [];
    if (vehicleData) {
      const { VEHICLE_TYPE_CD, USER_CD, LOC_CD, DEPT_CD } = vehicleData;
      const checklistQuery2 = `
        SELECT "CHK_CD", "VEH_TYP_CD", "QUESTION", "ANS_TYP", "EXP_ANS", "CRITICAL_ANS", "EXCLUDE_RANDOM"
        FROM "public"."FMS_OPCHK_QUEST_MST"
        WHERE "VEH_TYP_CD" = $1 AND "USER_CD" = $2 AND "LOC_CD" = $3 AND "DEPT_CD" = $4
      `;
      const checklistRes2 = await client.query(checklistQuery2, [VEHICLE_TYPE_CD, USER_CD, LOC_CD, DEPT_CD]);
      checklistSetting = checklistRes2.rows;
    }

    const firmwareQuery = `
      SELECT "MK3DBG"
      FROM "public"."FMS_VER_STORE"
      WHERE "VEHICLE_CD" = $1
    `;
    const firmwareRes = await client.query(firmwareQuery, [cd]);
    const firmwareVersion = firmwareRes.rows.length > 0 ? firmwareRes.rows[0].MK3DBG : null;

    const surveyTimeoutQuery = `
      SELECT "survey_timeout"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const surveyTimeoutRes = await client.query(surveyTimeoutQuery, [cd]);
    const surveyTimeout = surveyTimeoutRes.rows.length > 0 ? surveyTimeoutRes.rows[0].survey_timeout : null;

    const lastSessionQuery = `
      SELECT "last_session"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const lastSessionRes = await client.query(lastSessionQuery, [cd]);
    const lastSession = lastSessionRes.rows.length > 0 ? lastSessionRes.rows[0].last_session : null;

    // Consulta para obtener lockout status
    const lockoutStatusQuery = `
      SELECT "lockout_code"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const lockoutStatusRes = await client.query(lockoutStatusQuery, [cd]);
    const lockoutCode = lockoutStatusRes.rows.length > 0 ? lockoutStatusRes.rows[0].lockout_code : null;

    let lockoutStatus = "Unknown";
    if (lockoutCode !== null) {
      const lockoutStatusMap = {
        0: "Unlocked",
        253: "Impact Lockout",
        252: "Question Lockout",
        251: "Critical Question Lockout",
        254: "Survey Time Out Lockout"
      };
      lockoutStatus = lockoutStatusMap[lockoutCode] || "Lockout";
    }

    return res.json({ cd, GMTP_ID: vehicleIdResult, HireNo: HireNo, Serial: SERIAL_NO, Model: model, IsVOR: IsVOR, FullLockoutEnabled: full_lockout_enabled, FullLockoutEnabled:IdleTimeoutEnabled, IdleTimeoutTimer:IdleTimeoutTimer, IsCanBus:IsCanBus, FSSS_BASE:FSSS_BASE, IMPACT_LOCKOUT:IMPACT_LOCKOUT, impactSetting, supervisors, supervisorsList, generalInformationRes, DriverList, supervisorList, idleSetting, checklistSetting, firmwareVersion, surveyTimeout, lastSession, lockoutStatus });






    res.status(200).json(vehicles);

  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await client.end();
  }
};


// Name

exports.fleetiqname = async (req, res) => {

  const serialNo = req.params.serialNo;
  const userName = req.params.userName;

  
  console.log(serialNo + "---" + userName);

  const client = new Client({
    host: 'db-fleetiq-encrypt.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'multi',
    user: 'gmtp',
    password: 'MUVQcHz2DqZGHvZh'
  });

  try {
    await client.connect();

    // Consulta: Obtener USER_CD basado en userName
    const userQuery = `
      SELECT "USER_CD" 
      FROM "public"."FMS_CUST_MST" 
      WHERE "USER_NAME" = $1
    `;
    const userResult = await client.query(userQuery, [userName]);
    const userCd = userResult.rows[0]?.USER_CD;

    if (!userCd) {
      throw new Error('User not found');
    }

    console.log("USER_CD: ", userCd);
    console.log("Serial: ", serialNo)

    // Consulta: Obtener VEHICLE_CD basado en serialNo y USER_CD
    const vehicleQuery = `
      WITH user_vehicle_data AS (
        SELECT "USER_CD", "VEHICLE_CD", "LOC_CD", "DEPT_CD"
          FROM "public"."FMS_USR_VEHICLE_REL"
          WHERE "USER_CD" = $1
      )
      SELECT "VEHICLE_ID", "SERIAL_NO"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" IN (SELECT "VEHICLE_CD" FROM user_vehicle_data)
        AND "HIRE_NO" = $2;
      `;

    console.log(userCd + " --- " + serialNo)
    const vehicleResult = await client.query(vehicleQuery, [userCd, serialNo]);


    const vehicles = vehicleResult.rows;

    if (vehicles.length === 0) {
      throw new Error('No vehicles found');
    }

    console.log("Vehicles: ", vehicles);


    // Ahora aca se debe hacer la otra peticion

    // Por ahora tomara el primer vehiculo, por el mvp

    const firstVehicleId = vehicles[0].VEHICLE_ID;


    const vehicleIdParam = firstVehicleId

    const vehicleQueryy = `
      SELECT "VEHICLE_CD"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_ID" = $1
    `;
    const vehicleRes = await client.query(vehicleQueryy, [vehicleIdParam]);
    const cd = vehicleRes.rows.length > 0 ? vehicleRes.rows[0].VEHICLE_CD : null;

    if (!cd) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const generalInformationQuery = `
      SELECT 
        v."VEHICLE_ID", 
        v."SERIAL_NO", 
        v."full_lockout_enabled", 
        v."vor_setting", 
        v."ON_HIRE", 
        v."HIRE_NO", 
        e."model"
      FROM 
        "public"."FMS_VEHICLE_MST" v
      JOIN 
        "public"."equipment_view" e
      ON 
        v."SERIAL_NO" = e."serial_no"
      WHERE 
        v."VEHICLE_CD" = $1
    `;
    const generalInformationRes = await client.query(generalInformationQuery, [cd]);

    const vehicleIdResult = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].VEHICLE_ID : null;
    const HireNo = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].HIRE_NO : null;
    const SERIAL_NO = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].SERIAL_NO : null;
    const model = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].model : null;
    const IsVOR = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].vor_setting : null;
    const full_lockout_enabled = generalInformationRes.rows.length > 0 ? generalInformationRes.rows[0].full_lockout_enabled : null;


    
    // Viene la pagina Idle Setting


    const IdleSettingQuery = `SELECT 
                          "seat_idle", 
                          "idle_timer", 
                          "survey_timeout", 
                          "VEHICLE_ID", 
                          "VEHICLE_CD", 
                          "canrule"
                      FROM "public"."FMS_VEHICLE_MST" 
                      WHERE "VEHICLE_ID" = $1`


    const IdleSetting = await client.query(IdleSettingQuery, [vehicleIdParam]);

    const IdleTimeoutEnabled = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].idle_timer : null;
    const IdleTimeoutTimer = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].seat_idle : null;
    const IsCanBus = IdleSetting.rows.length > 0 ? IdleSetting.rows[0].canrule : null


    // Impact Setting

    const impactSettingQuery = `SELECT 
                          "FSSS_BASE", 
                          "IMPACT_LOCKOUT"
                          FROM "public"."FMS_VEHICLE_MST" 
                          WHERE "VEHICLE_ID" = $1`;

     const impactSetting = await client.query(impactSettingQuery, [vehicleIdParam]);      
     
    const FSSS_BASE = impactSetting.rows.length > 0 ? impactSetting.rows[0].FSSS_BASE : null;
    const IMPACT_LOCKOUT = impactSetting.rows.length > 0 ? impactSetting.rows[0].IMPACT_LOCKOUT : null;




    // Supervisor list

    const supervisorListQuery = `SELECT 
                                  u."USER_CD", 
                                  d."driver_name", 
                                  dept."DEPT_NAME", 
                                  loc."NAME", 
                                  MAX(u."CARD_ID") AS "CARD_ID", 
                                  MAX(u."CARD_PREFIX") AS "CARD_PREFIX", 
                                  MAX(u."DRIVER_ID") AS "DRIVER_ID"
                              FROM "public"."FMS_USR_MST" u
                              JOIN "public"."FMS_USER_DEPT_REL" r ON u."USER_CD" = r."USER_CD"
                              JOIN "public"."driver_list" d ON r."USER_CD" = d."user_cd"
                              JOIN "public"."FMS_LOC_MST" loc ON r."LOC_CD" = loc."LOCATION_CD"
                              JOIN "public"."FMS_DEPT_MST" dept ON r."DEPT_CD" = dept."DEPT_CD"
                              WHERE d."user_cd" IN (
                                  SELECT DISTINCT "user_cd"
                                  FROM "public"."driver_list"
                                  WHERE "driver_name" IN (
                                      SELECT "master_name"
                                      FROM "public"."master_list"
                                      WHERE "gmtp_id" = $1
                                  )
                              )
                              GROUP BY u."USER_CD", d."driver_name", dept."DEPT_NAME", loc."NAME"; `

    const supervisorsList = await client.query(supervisorListQuery, [vehicleIdParam]);

    const supervisors = supervisorsList.rows.length > 0 ? supervisorsList.rows : [];

    console.log(vehicleIdResult);

    const driverQuery = `
      SELECT 
      r."USER_CD", 
      d."driver_name", 
      dept."DEPT_NAME", 
      loc."NAME", 
      usr."CARD_ID", 
      usr."CARD_PREFIX", 
      usr."DRIVER_ID"
      FROM "public"."FMS_USER_DEPT_REL" r
      JOIN "public"."driver_list" d ON r."USER_CD" = d."user_cd"
      JOIN "public"."FMS_LOC_MST" loc ON r."LOC_CD" = loc."LOCATION_CD"
      JOIN "public"."FMS_DEPT_MST" dept ON r."DEPT_CD" = dept."DEPT_CD"
      JOIN "public"."FMS_USR_MST" usr ON r."USER_CD" = usr."USER_CD"
      WHERE d."gmtp_id" = $1
    `;
    const driverRes = await client.query(driverQuery, [vehicleIdResult]);
    const DriverList = driverRes.rows;

    const masterQuery = `
      SELECT "gmtp_id", "master_name", "slot_no", "weigand"
      FROM "public"."master_list"
      WHERE "gmtp_id" = $1
    `;
    const masterRes = await client.query(masterQuery, [vehicleIdResult]);
    const supervisorList = masterRes.rows;

    const idleSettingQuery = `
      SELECT "seat_idle"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const idleSettingRes = await client.query(idleSettingQuery, [cd]);
    const idleSetting = idleSettingRes.rows.length > 0 ? idleSettingRes.rows[0].seat_idle : null;

    const checklistQuery1 = `
      SELECT "VEHICLE_TYPE_CD", "USER_CD", r."LOC_CD", "DEPT_CD"
      FROM "public"."FMS_VEHICLE_MST" v
      JOIN "public"."FMS_USR_VEHICLE_REL" r ON v."VEHICLE_CD" = r."VEHICLE_CD"
      WHERE v."VEHICLE_CD" = $1
    `;
    const checklistRes1 = await client.query(checklistQuery1, [cd]);
    const vehicleData = checklistRes1.rows.length > 0 ? checklistRes1.rows[0] : null;

    let checklistSetting = [];
    if (vehicleData) {
      const { VEHICLE_TYPE_CD, USER_CD, LOC_CD, DEPT_CD } = vehicleData;
      const checklistQuery2 = `
        SELECT "CHK_CD", "VEH_TYP_CD", "QUESTION", "ANS_TYP", "EXP_ANS", "CRITICAL_ANS", "EXCLUDE_RANDOM"
        FROM "public"."FMS_OPCHK_QUEST_MST"
        WHERE "VEH_TYP_CD" = $1 AND "USER_CD" = $2 AND "LOC_CD" = $3 AND "DEPT_CD" = $4
      `;
      const checklistRes2 = await client.query(checklistQuery2, [VEHICLE_TYPE_CD, USER_CD, LOC_CD, DEPT_CD]);
      checklistSetting = checklistRes2.rows;
    }

    const firmwareQuery = `
      SELECT "MK3DBG"
      FROM "public"."FMS_VER_STORE"
      WHERE "VEHICLE_CD" = $1
    `;
    const firmwareRes = await client.query(firmwareQuery, [cd]);
    const firmwareVersion = firmwareRes.rows.length > 0 ? firmwareRes.rows[0].MK3DBG : null;

    const surveyTimeoutQuery = `
      SELECT "survey_timeout"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const surveyTimeoutRes = await client.query(surveyTimeoutQuery, [cd]);
    const surveyTimeout = surveyTimeoutRes.rows.length > 0 ? surveyTimeoutRes.rows[0].survey_timeout : null;

    const lastSessionQuery = `
      SELECT "last_session"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const lastSessionRes = await client.query(lastSessionQuery, [cd]);
    const lastSession = lastSessionRes.rows.length > 0 ? lastSessionRes.rows[0].last_session : null;

    // Consulta para obtener lockout status
    const lockoutStatusQuery = `
      SELECT "lockout_code"
      FROM "public"."FMS_VEHICLE_MST"
      WHERE "VEHICLE_CD" = $1
    `;
    const lockoutStatusRes = await client.query(lockoutStatusQuery, [cd]);
    const lockoutCode = lockoutStatusRes.rows.length > 0 ? lockoutStatusRes.rows[0].lockout_code : null;

    let lockoutStatus = "Unknown";
    if (lockoutCode !== null) {
      const lockoutStatusMap = {
        0: "Unlocked",
        253: "Impact Lockout",
        252: "Question Lockout",
        251: "Critical Question Lockout",
        254: "Survey Time Out Lockout"
      };
      lockoutStatus = lockoutStatusMap[lockoutCode] || "Lockout";
    }

    return res.json({ cd, GMTP_ID: vehicleIdResult, HireNo: HireNo, Serial: SERIAL_NO, Model: model, IsVOR: IsVOR, FullLockoutEnabled: full_lockout_enabled, FullLockoutEnabled:IdleTimeoutEnabled, IdleTimeoutTimer:IdleTimeoutTimer, IsCanBus:IsCanBus, FSSS_BASE:FSSS_BASE, IMPACT_LOCKOUT:IMPACT_LOCKOUT, impactSetting, supervisors, supervisorsList, generalInformationRes, DriverList, supervisorList, idleSetting, checklistSetting, firmwareVersion, surveyTimeout, lastSession, lockoutStatus });


  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await client.end();
  }

}



// FLEETFOCUS
// Gmtpid


exports.fleetfocus = async (req, res) => {

  const vehicleIdParam = req.query.vehicleId; 
  const client = new Client({
    host: 'http://54.147.187.245:81/phppgadmin/',
    port: 81,
    database: 'fleetiq360',
    user: 'gmtp',
    password: 'd5CnRfNA5LDzHmta'
  });


  console.log("Cliente: ")
  console.log(client)

  }




// All dealers
exports.getAllDealers = async (req, res) => {
  const client = new Client({
    host: 'db-fleetiq-encrypt.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'multi',
    user: 'gmtp',
    password: 'MUVQcHz2DqZGHvZh'
  });

  try {
    await client.connect();

    const query = `SELECT * FROM "public"."dealer"`;

    const result = await client.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await client.end();
  }
};

// GetCompanyFromDelar
exports.getCompanyFromDealer = async (req, res) => {
  const dealerId = req.params.dealer_id;

  const client = new Client({
    host: 'db-fleetiq-encrypt.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'multi',
    user: 'gmtp',
    password: 'MUVQcHz2DqZGHvZh'
  });

  try {
    await client.connect();

    const query = `
      SELECT "FMS_CUST_MST"."USER_NAME"
      FROM "FMS_CUST_MST"
      WHERE "FMS_CUST_MST"."USER_CD" IN (
      SELECT "dealer_cust_rel"."cust_id"
      FROM "dealer_cust_rel"
      WHERE "dealer_cust_rel"."dealer_id"= $1
      );            
    `;

    const result = await client.query(query, [dealerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No records found' });
    }

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    await client.end();
  }
};


// M2M TOKENS

// Controller to get the current M2M token
exports.getM2MToken = async (req, res) => {
  try {
    // Fetch the M2M token from the database
    const m2mToken = await prisma.m2MToken.findFirst();

    if (!m2mToken || m2mToken.expiry < Date.now()) {
      return res.status(404).json({ message: 'No valid M2M token found' });
    }

    // Convert BigInt expiry to Number
    res.json({
      token: m2mToken.token,
      expiry: Number(m2mToken.expiry), // Convert BigInt to number
    });
  } catch (error) {
    console.error('Error fetching M2M token:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Controller to refresh and store a new M2M token
exports.refreshM2MToken = async (req, res) => {
  try {
    // Fetch a new M2M token from Auth0
    const auth0Domain = 'dev-so03q0yu6n6ltwg2.us.auth0.com';
    const clientId = 'OTecWIseWQiOnbig6ZnghXuYhUXj3AO6';
    const clientSecret = 'cWAyvmQPccZvk5wZqxVrqAngdtVMsRxXGeZAIEcby_qFUL8CNTPTrGZmGuhPgPu2';
    const audience = 'https://www.ehelpdesk.com';

    const response = await axios.post(`https://${auth0Domain}/oauth/token`, {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: audience,
    });

    const newToken = response.data.access_token;
    const expiresIn = response.data.expires_in;
    const expiryTime = Date.now() + expiresIn * 1000;

    // Check if there's already a token and update it
    const existingToken = await prisma.m2MToken.findFirst();
    if (existingToken) {
      // Update existing token
      await prisma.m2MToken.update({
        where: { id: existingToken.id },
        data: { token: newToken, expiry: expiryTime },
      });
    } else {
      // Create a new token record
      await prisma.m2MToken.create({
        data: { token: newToken, expiry: expiryTime },
      });
    }

    res.json({ token: newToken, expiry: expiryTime });
  } catch (error) {
    console.error('Error refreshing M2M token:', error.message);
    res.status(500).json({ message: 'Failed to refresh M2M token' });
  }
};





//Verifica la conexion a la base de datos!
// (async () => {
//   try {
//       const query = 'SELECT NOW()';
//       const result = await pool.query(query);
//       console.log('Connection successful:', result.rows[0]);
//   } catch (err) {
//       console.error('Connection error:', util.inspect(err, { depth: null, colors: true }));
//   } finally {
//       await pool.end();
//   }
// })();



// Pagination 

// Controller to fetch paginated tickets
exports.getPaginatedTickets = async (req, res) => {
  const { page = 1, limit = 100 } = req.body; // Obtener parámetros de paginación
  const offset = (page - 1) * limit; // Calcular el desplazamiento

  try {
    // Obtener los tickets con paginación, ordenados por IDTicket de forma descendente
    const tickets = await prisma.ticket.findMany({
      skip: offset,     // Salta los tickets anteriores
      take: limit,      // Toma la cantidad de tickets solicitada
      orderBy: {
        IDTicket: 'desc',  // Ordenar por IDTicket de forma descendente (el más alto primero)
      },
    });

    // Obtener el total de tickets para calcular el total de páginas
    const totalTickets = await prisma.ticket.count();

    res.json({
      totalTickets,
      totalPages: Math.ceil(totalTickets / limit),  // Calcular el total de páginas
      currentPage: page,  // Página actual
      tickets,            // Tickets obtenidos
    });
  } catch (error) {
    console.error('Error fetching tickets:', error.message);
    res.status(500).json({ message: 'Failed to fetch tickets' });
  }
};




exports.handleChatbot = async (req, res) => {
  try {
    const { message } = req.body;
    let response;

    // Greetings
    if (/^(hi|hello|hey|good morning|good afternoon)$/i.test(message?.trim())) {
      response = {
        message: "Hi! I'm your E-Helpdesk assistant. How can I help you today?"
      };
    }
    // Ticket Related
    else if (message?.toLowerCase().includes('ticket')) {
      response = {
        message: "I can help you find ticket information. Please provide your ticket number or email and I'll assist you further."
      };
    }
    // Vehicle Related
    else if (message?.toLowerCase().includes('vehicle') || message?.toLowerCase().includes('forklift')) {
      response = {
        message: "For vehicle information, please provide the Vehicle ID or Serial Number."
      };
    }
    // Status Related
    else if (message?.toLowerCase().includes('status')) {
      response = {
        message: "To check any status, please provide the ticket number and I'll look it up for you."
      };
    }
    // Default response
    else {
      response = {
        message: "I can help you find information about tickets, vehicles, or check status. What would you like to know?"
      };
    }

    return res.json({ success: true, response });
    
  } catch (error) {
    console.error('Chatbot Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process chatbot request'
    });
  }
};


// In your API routes
exports.getAssignedTicketCount = async (req, res) => {
  try {
    const ticketCounts = await prisma.$queryRaw`
      SELECT 
        COALESCE(t."Supported", 'Unassigned') as name,
        CAST(COUNT(*) AS INTEGER) as value
      FROM "Ticket" t
      WHERE t."Supported" NOT LIKE '%/%'
      AND t."Supported" IS NOT NULL
      GROUP BY t."Supported"
      ORDER BY value DESC
    `;

    res.json(ticketCounts);
  } catch (error) {
    console.error('Error getting ticket counts:', error);
    res.status(500).json({ error: 'Failed to get ticket counts' });
  }
};


exports.getStatusCount = async (req, res) => {
  try {
    const statusCounts = await prisma.$queryRaw`
      SELECT 
        COALESCE(t."Status", 'Unassigned') as name,
        CAST(COUNT(*) AS INTEGER) as value
      FROM "Ticket" t
      WHERE t."Status" IS NOT NULL
      GROUP BY t."Status"
      ORDER BY value DESC
    `;

    res.json(statusCounts);
  } catch (error) {
    console.error('Error getting status counts:', error);
    res.status(500).json({ error: 'Failed to get status counts' });
  }
};


exports.getCategoryCount = async (req, res) => {
  try {
    const categoryCounts = await prisma.$queryRaw`
      SELECT 
        COALESCE(t."category", 'uncategorized') as name,
        CAST(COUNT(*) AS INTEGER) as value
      FROM "Ticket" t
      WHERE t."category" IS NOT NULL
      GROUP BY t."category"
      ORDER BY value DESC
    `;


    
    res.json(categoryCounts);
  } catch (error) {
    console.error('Error getting category counts:', error);
    res.status(500).json({ error: 'Failed to get category counts' });
  }
};


exports.getTicketsByLocation = async (req, res) => {
  console.log('Fetching tickets by location...');
  console.log('Received query parameters:', req.query);
  
  try {
    const { site_id } = req.query;

    if (!site_id) {
      return res.status(400).json({ 
        message: 'Missing site_id parameter' 
      });
    }

    // Parse site_id and handle potential JSON string
    let locationId;
    try {
      // Check if site_id is a JSON string
      const parsedSite = JSON.parse(site_id);
      locationId = parsedSite.site_id || parseInt(site_id);
    } catch {
      // If not JSON, try direct parsing
      locationId = parseInt(site_id);
    }

    if (isNaN(locationId)) {
      return res.status(400).json({ 
        message: 'Invalid site_id parameter' 
      });
    }

    const tickets = await prisma.ticket.findMany({
      where: {
        site_id: locationId
      },
      include: {
        assigned_user: {
          select: {
            id: true,
            Username: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    return res.status(200).json({
      count: tickets.length,
      tickets: tickets
    });

  } catch (error) {
    console.error('Error fetching tickets:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch tickets',
      details: error.message 
    });
  }
};






exports.getTicketsByStatus = async (req, res) => {
  try {
    // Get the status or statuses from query parameters
    const { status } = req.query;

    // Check if status is provided
    if (!status) {
      return res.status(400).json({ error: 'Status query parameter is required.' });
    }

    // If multiple statuses are provided, split them into an array
    const statuses = status.split(',');

    // Fetch tickets filtered by the provided statuses
    const tickets = await prisma.ticket.findMany({
      where: {
        status: {
          in: statuses, // Filter tickets where status matches any of the provided statuses
        },
      },
    });

    if (!tickets || tickets.length === 0) {
      return res.status(404).json({ message: 'No tickets found for the given status(es).' });
    }

    res.status(200).json(tickets);
  } catch (error) {
    console.error('Error filtering tickets by status:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};







exports.requireReadCustomerPermission = requirePermission('read:customer');
exports.requireReadTicketPermission = requirePermission('read:ticket');
exports.requireCreateTicket = requirePermission('create:ticket');



/**********************************************/


