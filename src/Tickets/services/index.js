const prisma = require('../../prisma');

exports.createTicketService = async (payload) => {
    return await prisma.ticket.create({
        data: payload,
    });
}

