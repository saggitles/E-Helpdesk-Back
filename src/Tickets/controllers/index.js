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
        newTicket.incident_date = new Date(newTicket.incident_date).toISOString();
      }

      const createdTicket = await ticketServices.createTicketService(newTicket)

     res.status(200).json({
        "status": 200,
        "message": "Ticket successfully created",
        "data": createdTicket
     });
    } catch (error) {
      console.error('Error creating ticket:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
  