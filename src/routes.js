const express = require('express');
const router = express.Router();
const controllers = require('./controllers');
const { auth } = require('express-oauth2-jwt-bearer');



// GUEST
router.post('/createGuestTicket', controllers.createGuestTicket); 

router.get('/getGuestTickets', controllers.getGuestTickets); 

router.delete('/deleteGuestTicket/:IDGuestTicket', controllers.deleteGuestTicket);

router.post('/approveGuestTicket/:IDGuestTicket',  controllers.approveGuestTicket);



// const jwtCheck = auth({
//     audience: 'https://www.ehelpdesk.com',
//     issuerBaseURL: `https://${process.env.DOMAIN}`,
//     tokenSigningAlg: 'RS256'
// });


// router.use(jwtCheck);

// router.get('/customers', controllers.requireReadCustomerPermission, controllers.getCustomers);
// router.get('/tickets', controllers.requireReadTicketPermission, controllers.getTickets);
// router.get('/ticketspagination', controllers.requireReadTicketPermission, controllers.getTicketsPagination);

// router.get('/tickets/:id', controllers.requireReadTicketPermission, controllers.getTicket);
// router.get('/tickets/:id/comments', controllers.requireReadTicketPermission, controllers.getCommentsForTicket);
// router.get('/tickets/:id/attachments', controllers.requireReadTicketPermission, controllers.getAttachmentsForTicket);
// router.post('/tickets/:id/attachments', controllers.requireReadTicketPermission, controllers.uploadFile);
// router.post('/tickets', controllers.requireReadTicketPermission, controllers.createTicket)
// router.post('/import', controllers.requireReadTicketPermission, controllers.importTickets)
// router.get('/deleteTicketsAndComents', controllers.requireReadTicketPermission, controllers.deleteTicketsAndComents)

// router.delete('/tickets/:id/attachments/:attachmentId', controllers.requireReadTicketPermission, controllers.deleteAttachment);
// router.delete('/tickets/:id', controllers.requireReadTicketPermission, controllers.deleteTicket)


router.get('/customers',  controllers.getCustomers);
router.get('/tickets',  controllers.getTickets);
router.get('/ticketspagination', controllers.getTicketsPagination);

router.get('/tickets/:id', controllers.getTicket);
router.get('/tickets/:id/comments', controllers.getCommentsForTicket);
router.get('/tickets/:id/attachments', controllers.getAttachmentsForTicket);
router.post('/tickets/:id/attachments', controllers.uploadFile);
router.post('/tickets', controllers.createTicket)
router.post('/import', controllers.importTickets)
router.get('/deleteTicketsAndComents', controllers.deleteTicketsAndComents)

router.delete('/tickets/:id/attachments/:attachmentId', controllers.deleteAttachment);
router.delete('/tickets/:id', controllers.deleteTicket)

router.put('/tickets/assign/:id', controllers.assignUserToTicket)
router.get('/tickets/:ticketId/assigneduser', controllers.getAssignedUserForTicket);
router.put('/updateTicketCategory/:id', controllers.updateTicketCategory)
router.put('/updateTicketStatus/:id', controllers.updateTicketStatus)

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
router.put('/tickets/:id', controllers.updateTicket);
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


// FLEET IQ 
// gmtpid
// router.get('/fleetiq',controllers.requireReadTicketPermission, controllers.fleetiq); 

// // serialid
// router.post('/fleetiqserial/:serialNo/:userName', controllers.requireReadTicketPermission, controllers.fleetiqserial);



// //GET ALL DEALERS
// router.get('/dealers', controllers.requireReadTicketPermission, controllers.getAllDealers);

// //Get companys from dealer
// router.get('/getCompanyFromDealer/:dealer_id', controllers.requireReadTicketPermission, controllers.getCompanyFromDealer);


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

router.get('/cake', controllers.getAssignedTicketCount);

router.get('/cake/status', controllers.getStatusCount);

router.get('/cake/category', controllers.getCategoryCount);



router.get('/', controllers.getWelcome);
router.get('/customers', controllers.getCustomers);
router.get('/sites', controllers.getSites);
router.get('/vehicles', controllers.getVehicles);

router.get('/tickets', controllers.getTicketsByLocation);


router.get("/available-dates", controllers.getAvailableDates);

router.get("/available-times", controllers.getAvailableTimes);

router.get("/snapshots", controllers.getVehicleSnapshots);

router.post('/tickets/filterByStatus', controllers.filterTicketsByStatus);

router.get('/ticket/export', controllers.exportAllTickets);

router.get('/gmpt-codes', controllers.getGmptCodesBySite);



module.exports = router;
