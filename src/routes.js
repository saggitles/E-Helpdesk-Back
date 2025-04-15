const express = require('express');
const router = express.Router();
const controllers = require('./controllers');
const ticketControllers = require('./Tickets/controllers/')
const vehicleControllers = require('./Vehicles/controllers/')
const { auth } = require('express-oauth2-jwt-bearer');
// Add this at top of routes.js
console.log('Available vehicle controller methods:', Object.keys(vehicleControllers));





router.get('/ticketspagination', controllers.getTicketsPagination);

//router.get('/tickets/:id', controllers.getTicket);
router.get('/tickets/:id/comments', controllers.getCommentsForTicket);
router.get('/tickets/:id/attachments', controllers.getAttachmentsForTicket);
router.post('/tickets/:id/attachments', controllers.uploadFile);
router.post('/import', controllers.importTickets)
router.get('/deleteTicketsAndComents', controllers.deleteTicketsAndComents)

router.delete('/tickets/:id/attachments/:attachmentId', controllers.deleteAttachment);
router.delete('/tickets/:id', controllers.deleteTicket)

router.put('/tickets/assign/:id', controllers.assignUserToTicket)
router.get('/tickets/:ticketId/assigneduser', controllers.getAssignedUserForTicket);
//router.put('/updateTicketCategory/:id', controllers.updateTicketCategory)
//router.put('/updateTicketStatus/:id', controllers.updateTicketStatus)

router.get('/comments', controllers.getComments);
router.post('/comments', controllers.createComment);
router.get('/comments/:id', controllers.getComment);
router.put('/comments/:id', controllers.updateComment);
router.delete('/comments/:id', controllers.deleteComment);

router.get('/users', controllers.getUsers);
router.get('/users/:id', controllers.getUser);
router.get('/users/:userId/roles', controllers.getRolesForUser);
router.post('/users', controllers.createUser);
router.put('/users/assign/:id', controllers.assignUserToUserRole)
router.put('/users/:id', controllers.updateUser);
router.delete('/users/:id', controllers.deleteUser);
router.get('/roles', controllers.getRoles);
router.get('/roles/:id', controllers.getRoleByID);
router.post('/roles', controllers.createRole);
router.delete('roles/:id', controllers.deleteRole);
router.delete('/tickets/:id', controllers.deleteTicket);

// -- JIRA

router.post('/jira', controllers.postJira, controllers.postJira);

// -- Jira Tickets
router.get('/jiratickets/:id',controllers.requireReadTicketPermission, controllers.getJiraTicketById);


// -- Jira
router.get('/jiratissue/:issueIdOrKey',controllers.requireReadTicketPermission, controllers.getJiraIssue);


// -- IOT

router.post('/iotdevices', controllers.fetchIoTDevices)

// -- FLEETXQ

router.post('/getvehicledetail', controllers.getVehicleDetail);


// FleetIQ
router.get('/fleetiq',controllers.fleetiq); 

// serialid
router.post('/fleetiqserial/:serialNo/:userName', controllers.fleetiqserial);

router.post('/fleetiqname/:serialNo/:userName', controllers.fleetiqname);


//FleetFocus
router.get('/fleetfocus',controllers.fleetfocus); 

//GET ALL DEALERS
router.get('/dealers',  controllers.getAllDealers);

//Get companys from dealer
router.get('/getCompanyFromDealer/:dealer_id', controllers.getCompanyFromDealer);

// m2m Tokens
router.get('/m2m-token', controllers.getM2MToken);
router.post('/m2m-token/refresh', controllers.refreshM2MToken);

// Pagination
router.post('/tickets/paginated', controllers.getPaginatedTickets);

router.post('/chatbot', controllers.handleChatbot);






router.get('/', controllers.getWelcome);



//router.put('/tickets/:id', controllers.updateTicket);

router.get('/tickets',  controllers.getTickets);
router.get('/cake', controllers.getAssignedTicketCount);
router.get('/cake/status', controllers.getStatusCount);
router.get('/cake/category', controllers.getCategoryCount);
//router.post('/tickets', controllers.createTicket)
router.get('/ticket/site', controllers.getTicketsByLocation);
router.get('/tickets/export', controllers.exportAllTickets);
router.get('/tickets/filterByStatus', controllers.getTicketsByStatus);
router.get('/gmpt-codes', controllers.getGmptCodesBySite);



router.get('/customers', vehicleControllers.getCustomers);
router.get('/sites', vehicleControllers.getSites);
router.get('/vehicles', vehicleControllers.getVehicles);
router.get("/available-dates", vehicleControllers.getAvailableDates);
router.get("/available-times", vehicleControllers.getAvailableTimes);
router.get("/snapshots", vehicleControllers.getVehicleSnapshots);


// Version api 2

// api/v2/

router.post('/tickets', ticketControllers.createTicket);
router.put('/tickets/:id', ticketControllers.updateTicket);

module.exports = router;
