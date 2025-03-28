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

exports.getCustomers = async (req, res) => {
  try {
    const customers = await prisma.customer.findMany();
    res.json(customers);
  } catch (error) {
    console.error('Error getting customer list:', error);
    res.status(500).json({ message: 'Internal server error getting client list.' });
  }
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
            Username: true
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


exports.getTickets = async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      include: {
        Customer: {
          select: {
            CustomerName: true
          }
        },
        AssignedUser: {
          select: {
            Username: true
          }
        }
      }
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


exports.getTicket = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const ticket = await prisma.ticket.findUnique({
      where: {
        IDTicket: id,
      },
    });
    if (ticket) {
      res.json(ticket);
    } else {
      res.status(404).json({ message: 'Ticket not found.' });
    }
  } catch (error) {
    console.error('Error getting ticket:', error);
    res.status(500).json({ message: 'Internal server error getting ticket.' });
  }
};

exports.getAssignedUserForTicket = async (req, res) => {
  const ticketId = parseInt(req.params.ticketId, 10); // Convert ticketId to integer

  try {
    // Fetch the ticket from the database
    const ticket = await prisma.ticket.findUnique({
      where: {
        IDTicket: ticketId,
      },
      include: {
        AssignedUser: true, // Include the associated user (assigned user)
      },
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Extract the assigned user ID from the ticket
    const assignedUserId = ticket.AssignedUser ? ticket.AssignedUser.IDUser : null;

    res.json({ assigneeId: assignedUserId });
  } catch (error) {
    console.error('Error getting assigned user for ticket:', error);
    res.status(500).json({ message: 'Internal server error getting assigned user for ticket.' });
  }
};

exports.createTicket = async (req, res) => {
  const newTicket = req.body;
  const createdTicket = await prisma.ticket.create({ data: newTicket });
  res.status(201).json(createdTicket);
};


exports.updateTicket = async (req, res) => {
  console.log('Request Body:', req.body); // Ver contenido del body
  let ticketId = req.params.id;
  const { JiraTicketID, createdAt, updatedAt, incidentDate, ...updatedFields } = req.body;

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


function excelSerialDateToJSDate(serial) {
  const excelEpoch = new Date(1899, 11, 30); // La época de Excel es el 30 de diciembre de 1899
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

exports.assignUserToTicket = async (req, res) => {
  const ticketId = req.params.id;
  const assignedUserId = req.body.AssignedUserID;
  // Convertir ticketId a número si es necesario
  const parsedTicketId = !isNaN(ticketId) ? parseInt(ticketId, 10) : null;
  try {
    if (parsedTicketId === null) {
      throw new Error("Invalid ticket ID");
    }
    // Actualizar solo el campo AssignedUserID
    const result = await prisma.ticket.update({
      where: { IDTicket: parsedTicketId },
      data: {
        AssignedUserID: assignedUserId,
      },
    });
    res.json(result);
  } catch (error) {
    console.error("Error assigning user to ticket:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


// Update Category
exports.updateTicketCategory = async (req, res) => {
  const ticketId = req.params.id;
  const newCategory = req.body.Category;
  // Convertir ticketId a número si es necesario
  const parsedTicketId = !isNaN(ticketId) ? parseInt(ticketId, 10) : null;
  try {
    if (parsedTicketId === null) {
      throw new Error("Invalid ticket ID");
    }
    // Actualizar solo el campo Category
    const result = await prisma.ticket.update({
      where: { IDTicket: parsedTicketId },
      data: {
        Category: newCategory,
      },
    });
    res.json(result);
  } catch (error) {
    console.error("Error updating ticket category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
// Update Status
exports.updateTicketStatus = async (req, res) => {
  const ticketId = req.params.id;
  const newStatus = req.body.Status;
  // Convertir ticketId a número si es necesario
  const parsedTicketId = !isNaN(ticketId) ? parseInt(ticketId, 10) : null;
  try {
    if (parsedTicketId === null) {
      throw new Error("Invalid ticket ID");
    }
    // Actualizar solo el campo Status
    const result = await prisma.ticket.update({
      where: { IDTicket: parsedTicketId },
      data: {
        Status: newStatus,
      },
    });
    res.json(result);
  } catch (error) {
    console.error("Error updating ticket status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

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

// exports.createComment = async (req, res) => {
//   const newComment = req.body;
  
//   try {
//     const createdComment = await prisma.comment.create({ data: newComment });
//     res.status(201).json(createdComment);
//   } catch (error) {
//     res.status(500).json({ error: 'Error creating comment' });
//   }
// };

exports.createComment = async (req, res) => {
  const { Content, TicketID } = req.body;
  
  try {
    const token = req.headers.authorization; // Assuming the access token is provided in the Authorization header
    if (!token) {
      return res.status(401).json({ error: 'Access token is missing' });
    }

    // Fetch user information from the /userinfo endpoint using the access token
    const userInfoResponse = await axios.get('https://dev-so03q0yu6n6ltwg2.us.auth0.com/userinfo', {
      headers: {
        Authorization: token,
      },
    });

    console.log("userInfoResponse",userInfoResponse)

    const userEmail = userInfoResponse.data.email; // Get the user's email from the response

    // Fetch user data from your backend using the user's email and access token
    const userResponse = await axios.get(`https://ci-ehelpdesk-be.azurewebsites.net/api/users/?email=${userEmail}`, {
      headers: {
        Authorization: token,
      },
    });

    console.log("USER RESPONSE", userResponse.data[0].IDUser)
    const { IDUser } = userResponse.data[0]; // Assuming the user ID is available in the response data

    // Create the comment and associate it with the user retrieved from the database
    const createdComment = await prisma.comment.create({
      data: {
        Content,
        Ticket: { connect: { IDTicket: TicketID } },
        User: { connect: { IDUser } }, // Assign the user to the comment
      },
      include: {
        User: true, // Include the user information in the response
      },
    });
    
    // Send the response with the created comment and user information
    res.status(201).json(createdComment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Error creating comment' });
  }
};

// Borra tickets y borra comentarios
exports.deleteTicketsAndComents = async (req, res) => {
  await prisma.comment.deleteMany({});
  console.log("Todos los comentarios han sido eliminados.");

  // Paso 2: Eliminar todos los tickets existentes
  await prisma.ticket.deleteMany({});
  console.log("Todos los tickets existentes han sido eliminados.");

  // Paso 3: Reiniciar los IDs de Ticket y Comment si estás usando PostgreSQL
  await prisma.$executeRaw`ALTER SEQUENCE "Ticket_IDTicket_seq" RESTART WITH 1;`;
  await prisma.$executeRaw`ALTER SEQUENCE "Comment_IDComment_seq" RESTART WITH 1;`;
}


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
  const { id } = req.params;
  
  try {
    const deletedComment = await prisma.comment.delete({
      where: {
        IDComment: Number(id),
      },
    });

    res.status(200).json({ message: 'Comentario eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el comentario' });
  }
};

exports.getCommentsForTicket = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const comments = await prisma.comment.findMany({
      where: {
        TicketID: ticketId,
      },
    });
    res.status(200).json(comments);
  } catch (error) {
    console.error('Error getting comments for the ticket:', error);
    res.status(500).json({ error: 'Error fetching comments for the ticket.' });
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
        IDUser: userId,
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
  const { Username, FirstName, LastName, Email, UserRole } = req.body;

  try {
    // Create the user
    const newUser = await prisma.user.create({
      data: {
        Username,
        FirstName,
        LastName,
        Email,
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

// UPLOAD FILE

exports.getAttachmentsForTicket = async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    // Assuming you have a File model in your Prisma schema
    const attachments = await prisma.File.findMany({
      where: {
        TicketID: ticketId,
      },
    });
    res.status(200).json(attachments);
  } catch (error) {
    console.error('Error getting attachments for the ticket:', error);
    res.status(500).json({ error: 'Error fetching attachments for the ticket.' });
  }
};
// Assuming you're using Prisma for DB interaction

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



// GUEST 

exports.createGuestTicket = async (req, res) => {
  const { yourName, yourEmail, vehicleIdOrDriverName, reportedBy, companyName, issue, issueTime } = req.body;
  try {
    const newTicket = await prisma.guestTicket.create({
      data: {
        yourName,
        yourEmail,
        vehicleIdOrDriverName,
        reportedBy,
        companyName,
        issue,
        issueTime: new Date(issueTime),
      },
    });
    res.status(201).json(newTicket);
  } catch (error) {
    res.status(500).json({ error: 'Error creating ticket', details: error.message });
  }
};


exports.deleteGuestTicket = async (req, res) => {
  const { IDGuestTicket } = req.params;
  try {
    const deletedTicket = await prisma.guestTicket.delete({
      where: {
        IDGuestTicket: parseInt(IDGuestTicket),
      },
    });
    res.status(200).json(deletedTicket);
  } catch (error) {
    res.status(500).json({ error: 'Error deleting ticket', details: error.message });
  }
};


exports.getGuestTickets = async (req, res) => {
  try {
    const tickets = await prisma.guestTicket.findMany();
    res.status(200).json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching tickets', details: error.message });
  }
};


// -----------------


exports.approveGuestTicket = async (req, res) => {
  const { IDGuestTicket } = req.params;
  console.log("IDGuestTicket:", IDGuestTicket); // Verificar que IDGuestTicket se está recibiendo correctamente

  try {
    // Obtener el ticket de invitado
    const guestTicket = await prisma.guestTicket.findUnique({
      where: { IDGuestTicket: parseInt(IDGuestTicket) },
      include: {
        Files: true,
        Images: true
      }
    });

    console.log("Guest Ticket:", guestTicket); // Verificar que se obtiene el guestTicket correctamente

    if (!guestTicket) {
      return res.status(404).json({ error: "Guest ticket not found" });
    }

    // Crear un nuevo ticket en el modelo principal
    const newTicket = {
      Title: guestTicket.issue,
      Description: guestTicket.issue,
      Priority: "Medium", 
      Status: "To Do",
      VehicleID: guestTicket.vehicleIdOrDriverName,
      driversName: guestTicket.vehicleIdOrDriverName,
      Reporter: guestTicket.reportedBy,
      Companyname: guestTicket.companyName,
      Email: guestTicket.yourEmail,
      incidentDate: guestTicket.issueTime,
      Category: "Guess ticket", // Ajusta esto según tus necesidades
      Files: {
        connect: guestTicket.Files.map(file => ({ id: file.id }))
      },
      Images: {
        connect: guestTicket.Images.map(image => ({ id: image.id }))
      }
    };

    console.log("New Ticket Data:", newTicket); // Verificar los datos del nuevo ticket antes de crearlo

    const createdTicket = await prisma.ticket.create({
      data: newTicket
    });

    console.log("Created Ticket:", createdTicket); // Verificar que el ticket se creó correctamente

    // Eliminar el guest ticket
    await prisma.guestTicket.delete({
      where: { IDGuestTicket: parseInt(IDGuestTicket) }
    });

    console.log("Guest Ticket Deleted"); // Confirmar que el guest ticket fue eliminado

    res.status(201).json(createdTicket);
  } catch (error) {
    console.error("Error approving guest ticket:", error); // Imprimir el error para depuración
    res.status(500).json({ error: "Failed to approve guest ticket" });
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
        COALESCE(t."Category", 'Uncategorized') as name,
        CAST(COUNT(*) AS INTEGER) as value
      FROM "Ticket" t
      WHERE t."Category" IS NOT NULL
      GROUP BY t."Category"
      ORDER BY value DESC
    `;


    
    res.json(categoryCounts);
  } catch (error) {
    console.error('Error getting category counts:', error);
    res.status(500).json({ error: 'Failed to get category counts' });
  }
};


// Fetch all customers for the filter in the navbar


exports.getCustomers = async (req, res) => {
  const client = new Client({
    host: 'db-fleetiq-encrypt-01.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'multi',
    user: 'gmtp',
    password: 'MUVQcHz2DqZGHvZh'
  });

  try {
    await client.connect(); // Establish connection

    const query = `SELECT DISTINCT "USER_CD", "USER_NAME" FROM "public"."FMS_CUST_MST"`;
    const result = await client.query(query);

    await client.end(); // Close connection

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching customers:', err.message);
    return res.status(500).json({ error: 'Database query failed', details: err.message });
  }
};

exports.getSites = async (req, res) => {
  const { customer } = req.query;
  if (!customer) {
    console.error("Error: Missing customer ID in request");
    return res.status(400).json({ error: "Customer ID is required" });
  }

  // Convert customer to an integer if necessary
  const customerId = parseInt(customer, 10);
  if (isNaN(customerId)) {
    console.error("Error: customer ID must be an integer, received:", customer);
    return res.status(400).json({ error: "Invalid customer ID" });
  }
  
  try {
    const query = `
      SELECT DISTINCT FLM."LOCATION_CD", FLM."NAME" 
      FROM "FMS_USR_VEHICLE_REL" FUVR
      JOIN "FMS_LOC_MST" FLM ON FUVR."LOC_CD" = FLM."LOCATION_CD"
      WHERE FUVR."USER_CD" = $1
    `;

    //console.log(`Executing Query: ${query} with customer ID: ${customerId}`);
    

    const client = new Client({
      host: 'db-fleetiq-encrypt-01.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
      port: 5432,
      database: 'multi',
      user: 'gmtp',
      password: 'MUVQcHz2DqZGHvZh'
    });

    await client.connect();
    const result = await client.query(query, [customerId]);
    await client.end();

    //console.log("Fetched Sites:", result.rows);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("Database Query Failed:", err.message);
    return res.status(500).json({ error: "Database query failed", details: err.message });
  }
};

exports.getVehicles = async (req, res) => {
  const { site, customer, gmptCode } = req.query;

  if (!customer && !gmptCode) {
    return res.status(400).json({ error: "Customer or GMPT Code is required" });
  }

  const client = new Client({
    host: "db-fleetiq-encrypt-01.cmjwsurtk4tn.us-east-1.rds.amazonaws.com",
    port: 5432,
    database: "multi",
    user: "gmtp",
    password: "MUVQcHz2DqZGHvZh",
  });

  try {
    await client.connect();
    
    // 🔹 Step 1: Get VEHICLE_CD First (If Searching by GMPT)
    let vehicleCDs = [];
    if (gmptCode) {
      const cdQuery = `SELECT "VEHICLE_CD" FROM "FMS_VEHICLE_MST" WHERE "VEHICLE_ID" = $1;`;
      const cdResult = await client.query(cdQuery, [gmptCode]);
      vehicleCDs = cdResult.rows.map(row => row.VEHICLE_CD);
    } else if (site) {
      const siteQuery = `SELECT "VEHICLE_CD" FROM "FMS_USR_VEHICLE_REL" WHERE "LOC_CD" = $1;`;
      const siteResult = await client.query(siteQuery, [site]);
      vehicleCDs = siteResult.rows.map(row => row.VEHICLE_CD);
    } else {
      const customerQuery = `SELECT "VEHICLE_CD" FROM "FMS_USR_VEHICLE_REL" WHERE "USER_CD" = $1;`;
      const customerResult = await client.query(customerQuery, [customer]);
      vehicleCDs = customerResult.rows.map(row => row.VEHICLE_CD);
    }

    if (vehicleCDs.length === 0) {
      return res.status(404).json({ error: "No vehicles found" });
    }

    //console.log("Fetched VEHICLE_CD:", vehicleCDs);

    // 🔹 Step 2: Fetch Basic Vehicle Info
    const vehicleInfo = await fetchVehicleInfo(client, vehicleCDs);

    // 🔹 Step 3: Fetch Additional Data (Master Codes & Blacklisted Drivers)
    const [masterCodes, blacklistedDrivers] = await Promise.all([
      fetchMasterCodes(client, vehicleCDs), // ✅ Using VEHICLE_CD now
      fetchBlacklistedDrivers(client, vehicleCDs) // ✅ Using VEHICLE_CD now
    ]);

    await client.end();

    // 🔹 Step 4: Merge Additional Data into Vehicle Info
    const responseData = vehicleInfo.map(vehicle => ({
      ...vehicle,
      master_codes: masterCodes[vehicle.VEHICLE_CD] || [],
      blacklisted_drivers: blacklistedDrivers[vehicle.VEHICLE_CD] || []
    }));

    return res.status(200).json(responseData);

  } catch (err) {
    console.error("Database Query Failed:", err.message);
    return res.status(500).json({ error: "Database query failed", details: err.message });
  }
};

// ✅ Fetch Basic Vehicle Info
async function fetchVehicleInfo(client, vehicleCDs) {
  const query = `
            SELECT 
            fvm."VEHICLE_CD",
            jsonb_build_object(
                'vehicleName', ev."hire_no",
                'serialNumber', ev."serial_no",
                'gmptCode', fvm."VEHICLE_ID",
                'firmwareVersion', ev."firmware_ver",
                'screenVersion', ev."product_type",
                'expansionVersion', ev."exp_mod_ver",
                'lastConnection', COALESCE(TO_CHAR(fvm."LAST_EOS", 'DD/MM/YYYY HH24:MI'), 'N/A'),
                'department', fdm."DEPT_NAME",
                'vorSetting', fvm."vor_setting",
                'lockoutCode', fvm."lockout_code",
                'impactLockout', fvm."IMPACT_LOCKOUT",
                'surveyTimeout', fvm."survey_timeout",
                'seatIdle', fvm."seat_idle",
                'redImpactThreshold', ROUND(CAST(0.00388 * SQRT(COALESCE(fvm."FSSS_BASE", 0) * COALESCE(fvm."FSSSMULTI", 0) * 10) AS NUMERIC), 3),
                'impactRecalibrationDate', COALESCE(TO_CHAR(ews."impact_recalibration_date", 'DD/MM/YYYY HH24:MI'), 'N/A'),
                'preopSchedule', ews."preop_schedule",
                'simNumber', fvm."CCID",
                'vehicleType', fvm."VEHICLE_TYPE_CD",
                'vehicleModel', vt."VEHICLE_TYPE",
                'status', COALESCE(( 
                    SELECT CASE 
                        WHEN MAX(fcv."TIME_STAMP") < NOW() - INTERVAL '2 hours' THEN 'Offline'
                        ELSE 'Online'
                    END
                    FROM "FMS_CARD_VERIFICATION" fcv
                    WHERE fcv."VEH_CD" = fvm."VEHICLE_CD"
                    AND DATE(fcv."TIME_STAMP") = CURRENT_DATE
                ), 'Unknown'),
                'fullLockoutEnabled', fvm."full_lockout_enabled",
                'fullLockoutTimeout', fvm."full_lockout_timeout",
                -- Added Customer and Site Names:
                'customerName', cust."USER_NAME",
                'siteName', loc."NAME"
            ) AS vehicle_info
        FROM "equipment_view" ev
        LEFT JOIN "FMS_VEHICLE_MST" fvm ON ev."gmtp_id" = fvm."VEHICLE_ID"
        LEFT JOIN "FMS_USR_VEHICLE_REL" fuvr ON fvm."VEHICLE_CD" = fuvr."VEHICLE_CD"
        LEFT JOIN "FMS_DEPT_MST" fdm ON fuvr."DEPT_CD" = fdm."DEPT_CD"
        -- If the customer key in FMS_USR_VEHICLE_REL is not USER_CD, adjust the column name below.
        LEFT JOIN "FMS_CUST_MST" cust ON fuvr."USER_CD" = cust."USER_CD"
        -- If the site key in FMS_USR_VEHICLE_REL is different, adjust the column name below.
        LEFT JOIN "FMS_LOC_MST" loc ON fuvr."LOC_CD" = loc."LOCATION_CD"
        LEFT JOIN "equipment_website_settings" ews ON fvm."VEHICLE_ID" = ews."gmtp_id"
        LEFT JOIN "FMS_VEHICLE_TYPE_MST" vt ON fvm."VEHICLE_TYPE_CD" = vt."VEHICLE_TYPE_CD"
        WHERE fvm."VEHICLE_CD" = ANY($1);

  `;

  const result = await client.query(query, [vehicleCDs]);
  console.log('Fetching new vehicles...',result.rows)

  return result.rows;
}

// ✅ Fetch Master Codes using VEHICLE_CD
async function fetchMasterCodes(client, vehicleCDs) {
  const query = `
    SELECT fvo."VEHICLE_CD", jsonb_build_object('masterCodeUser', fum."USER_NAME") AS master_code
    FROM "FMS_VEHICLE_OVERRIDE" fvo
    JOIN "FMS_USR_MST" fum ON fvo."USER_CD" = fum."USER_CD"
    WHERE fvo."VEHICLE_CD" = ANY($1);
  `;

  const result = await client.query(query, [vehicleCDs]);
  return groupByVehicle(result.rows, "master_code");
}

// ✅ Fetch Blacklisted Drivers using VEHICLE_CD
async function fetchBlacklistedDrivers(client, vehicleCDs) {
  const query = `
    SELECT fdb."VEHICLE_CD", jsonb_build_object('blacklistedDriver', fum_blacklist."USER_NAME") AS blacklisted_driver
    FROM "FMS_DRIVER_BLKLST" fdb
    JOIN "FMS_USR_MST" fum_blacklist ON fdb."USER_CD" = fum_blacklist."USER_CD"
    WHERE fdb."VEHICLE_CD" = ANY($1);
  `;

  const result = await client.query(query, [vehicleCDs]);
  return groupByVehicle(result.rows, "blacklisted_driver");
}

// ✅ Utility Function to Group Data by VEHICLE_CD
function groupByVehicle(rows, field) {
  return rows.reduce((acc, row) => {
    if (!acc[row.VEHICLE_CD]) acc[row.VEHICLE_CD] = [];
    acc[row.VEHICLE_CD].push(row[field]);
    return acc;
  }, {});
}


exports.getTicketsByLocation = async (req, res) => {
  try {
      const { locationCD } = req.query;  // Obtener el parámetro desde la URL

      if (!locationCD) {
          return res.status(400).json({ message: 'Missing locationCD parameter' });
      }

      // Convertir a número
      const locationId = parseInt(locationCD);

      if (isNaN(locationId)) {
          return res.status(400).json({ message: 'Invalid locationCD parameter' });
      }

      // Consultar los tickets con el `LocationCD` especificado
      const tickets = await prisma.ticket.findMany({
          where: {
              LocationCD: locationId
          },
          include: {
              Customer: {
                  select: { CustomerName: true }
              },
              AssignedUser: {
                  select: { Username: true }
              }
          }
      });

      res.status(200).json(tickets);
  } catch (error) {
      console.error('Error fetching tickets by location:', error);
      res.status(500).json({ message: 'Internal server error fetching tickets by location' });
  }
};


const dbConfig = {
  host: '192.168.1.193',
  user: 'postgres',
  password: 'admin',
  database: 'E-helpdesk',
  port: 5432,
};

exports.getAvailableDates = async (req, res) => {
  const client = new Client(dbConfig);

  try {
    await client.connect();

    const query = `
    SELECT DISTINCT query_execution_date AS date
    FROM "vehicle_info"
    ORDER BY date DESC;
  `;

    const result = await client.query(query);
    const dates = result.rows.map((row) => row.date);

    res.json(dates);
  } catch (error) {
    console.error('Error fetching available dates:', error.message);
    res.status(500).json({ error: 'Failed to fetch available dates' });
  } finally {
    await client.end();
  }
};






exports.getAvailableTimes = async (req, res) => {
  const { date } = req.query;
  const client = new Client(dbConfig);

  try {
    await client.connect();

    const query = `
      SELECT MIN(snapshot_id) AS id, TO_CHAR(query_execution_date, 'HH24:MI') AS time
      FROM vehicle_info
      WHERE DATE(query_execution_date) = $1
      GROUP BY TO_CHAR(query_execution_date, 'HH24:MI')
      ORDER BY time ASC;
    `;

    const result = await client.query(query, [date]);
    const times = result.rows.map(row => ({
      ID: row.id,
      time: row.time,
    }));

    res.json(times);
  } catch (error) {
    console.error('Error fetching times:', error.message);
    res.status(500).json({ error: 'Failed to fetch times' });
  } finally {
    await client.end();
  }
};




exports.getVehicleSnapshots = async (req, res) => {
  console.log('📦 Snapshot route hit!');
  // Get snapshot time filters
  const { format } = require('date-fns');
  const time1 = req.query.time1 || req.query.TIME1;
  const time2 = req.query.time2 || req.query.TIME2;
  const date1 = req.query.date1 || req.query.Date1;
  const date2 = req.query.date2 || req.query.Date2;
  // Get vehicle filters
  const customer = req.query.customer;
  const site = req.query.site; // optional
  const gmptCode = req.query.gmptCode; // optional

  if (!time1 || !time2 || !customer) {
    return res.status(400).json({ error: 'Missing required snapshot times or customer filter' });
  }

  // Convert date objects to the expected string format.
  // If date1 and date2 are Date objects, format them; if they're strings, you may need to parse them first.
  const formattedDate1 = format(new Date(date1), 'yyyy-MM-dd');
  const formattedDate2 = format(new Date(date2), 'yyyy-MM-dd');

  const client = new Client(dbConfig);
  try {
    await client.connect();

    const customerInt = parseInt(customer);
    const queryParams = [formattedDate1, formattedDate2, time1, time2, customerInt];
    // Build extra conditions
    let extraConditions = ` AND "cust_id" = $5`;
    if (site) {
      const siteInt = parseInt(site);
      extraConditions += ` AND "site_id" = $6`;
      queryParams.push(siteInt);
    }
    if (gmptCode) {
      extraConditions += ` AND "gmptCode" = $${queryParams.length + 1}`;
      queryParams.push(gmptCode);
    }
    
    console.log('costumer',customer)
    console.log('site',site)
    console.log('gmptCode',gmptCode)
    console.log('date1',date1)
    console.log('time1',time1)
    console.log('date2',date2)
    console.log('time2',time2)
    

    // Query snapshots within the time ranges (each time range is start time plus 58 minutes)
    const query = `
      SELECT DISTINCT ON (vehicle_cd, snapshot_time) *
      FROM (
        SELECT *,
              TO_CHAR(query_execution_date, 'HH24:MI') AS snapshot_time
        FROM "vehicle_info"
        WHERE (
              (TO_CHAR(query_execution_date, 'YYYY-MM-DD') = $1 
                AND TO_CHAR(query_execution_date, 'HH24:MI') = $3)
              OR
              (TO_CHAR(query_execution_date, 'YYYY-MM-DD') = $2 
                AND TO_CHAR(query_execution_date, 'HH24:MI') = $4)
              )
              ${extraConditions}
      ) AS sub
      ORDER BY vehicle_cd, snapshot_time, query_execution_date;



    `;
    const result = await client.query(query, queryParams);
    console.log('Query result rows:', result.rows);

    const pairedSnapshots = result.rows.reduce((acc, row) => {
      const vCode = row.vehicle_cd;
      if (!acc[vCode]) {
        acc[vCode] = { before: [], after: [] };
      }
      if (row.snapshot_time === time1) {
        acc[vCode].before.push(row);
      } else if (row.snapshot_time === time2) {
        acc[vCode].after.push(row);
      }
      return acc;
    }, {});

    console.log('Paired snapshots by vehicle_cd:', pairedSnapshots);
    res.json(pairedSnapshots);
  } catch (error) {
    console.error('Error fetching snapshots:', error.message);
    res.status(500).json({ error: 'Internal server error fetching snapshots' });
  } finally {
    await client.end();
  }
};

// Utility function to add minutes to a time string (HH:MM)
function addMinutes(timeStr, minutesToAdd) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}


// Utility function to add minutes to a time string (HH:MM)
function addMinutes(timeStr, minutesToAdd) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}





exports.filterTicketsByStatus = async (req, res) => {
  const { statuses } = req.body;

  if (!Array.isArray(statuses) || statuses.length === 0) {
    return res.status(400).json({ error: 'Invalid or missing status list' });
  }

  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        Status: {
          in: statuses
        }
      },
      orderBy: {
        IDTicket: 'desc'
      },
      include: {
        Customer: {
          select: {
            CustomerName: true
          }
        },
        AssignedUser: {
          select: {
            Username: true
          }
        }
      }
    });

    // Format output to match the structure used in `getTickets`
    const formatted = tickets.map(ticket => ({
      ...ticket,
      Customer: ticket.Customer?.CustomerName || null,
      User: ticket.AssignedUser?.Username || null
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Error filtering tickets by status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


exports.exportAllTickets = async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany();

    if (!tickets || tickets.length === 0) {
      return res.status(404).json({ message: 'No tickets found.' });
    }

    // Convert to CSV format
    const fields = Object.keys(tickets[0]);
    const csv = [
      fields.join(','), // headers
      ...tickets.map(ticket => fields.map(f => `"${ticket[f]}"`).join(',')) // rows
    ].join('\n');

    res.setHeader('Content-Disposition', 'attachment; filename=tickets.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting tickets:', error.message);
    res.status(500).json({ error: 'Failed to export tickets.' });
  }
};


// In controllers.js
exports.getGmptCodesBySite = async (req, res) => {
  const { locationCD } = req.query;

  if (!locationCD) {
    return res.status(400).json({ error: 'Missing locationCD' });
  }

  const client = new Client(dbConfig);
  await client.connect();

  try {
    const query = `
      SELECT fvm."VEHICLE_ID" as gmptCode
      FROM "FMS_VEHICLE_MST" fvm
      WHERE fvm."LOCATION_CD" = $1
    `;
    const result = await client.query(query, [locationCD]);
    const codes = result.rows.map(row => row.gmptcode); // Make sure column name is lowercase
    res.json(codes);
  } catch (err) {
    console.error('Error fetching GMPT codes:', err.message);
    res.status(500).json({ error: 'Internal error fetching GMPT codes' });
  } finally {
    await client.end();
  }
};





exports.requireReadCustomerPermission = requirePermission('read:customer');
exports.requireReadTicketPermission = requirePermission('read:ticket');
exports.requireCreateTicket = requirePermission('create:ticket');



/**********************************************/


