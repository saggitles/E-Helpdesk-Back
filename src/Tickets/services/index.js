const prisma = require('../../prisma');
const { dateFormatForDatabaseRequest } = require('../../utils/date');

exports.createTicketService = async (payload) => {
    /* const db = myOwnConnectionToDatabase() <- si esto prisma? typeorm? dynogels?
        db.ticket.create() <- 
    */
    return await prisma.ticket.create({
        data: payload,
    });
}

exports.updateTicketService = async (payload) => {
    console.log('payload', payload)
    // Ensure `openSince` is not included in the update.
    delete payload.open_since;
    delete payload.created_at;

    if (payload.is_escalated !== undefined) {
      payload.is_escalated = payload.is_escalated ? "true" : "false";
  }
  
    const updatedData = {
        ...payload,
        ...(payload.assigned_user_id && {
            assigned_user: {
                connect: { 
                    id: parseInt(payload.assigned_user_id) 
                }
            }
        }),
        ...(payload.incident_date && {
          incident_date: dateFormatForDatabaseRequest(payload.incident_date)
        }),
        ...(payload.created_at && {
          created_at: dateFormatForDatabaseRequest(payload.created_at)
        }),
        ...(payload.updated_at && {
          updated_at: dateFormatForDatabaseRequest(payload.updated_at)
        })
      };   return await prisma.ticket.update({
            where: { id: payload.id },
            data: updatedData,
            include: {
              assigned_user: {
                  select: {
                      id: true,
                      username: true,
                      email: true
                  }
              }
          }
      });
}

