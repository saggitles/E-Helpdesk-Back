function successfulResponse ({ data, message }) {
    return {
        "status": 200,
        "message": message ?? "Successful!",
        "data": data
    }
}
module.exports = {
  successfulResponse
}