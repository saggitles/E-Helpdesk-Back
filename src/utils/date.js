function excelSerialDateToJSDate(serial) {
    const excelEpoch = new Date(1899, 11, 30);
    const excelEpochAsUnixTimestamp = excelEpoch.getTime();
    const missingLeapYearDay = 24 * 60 * 60 * 1000;
    const daysToMs = (serial - 1) * 24 * 60 * 60 * 1000;
    return new Date(excelEpochAsUnixTimestamp + daysToMs + missingLeapYearDay);
  }
  


  function dateFormatForDatabaseRequest(date) {
    // Skip if no date provided
    if (!date) return null;
    
    try {
      // Handle string dates
      if (typeof date === 'string') {
        return new Date(date).toISOString();
      }
      // Handle Date objects
      if (date instanceof Date) {
        return date.toISOString();
      }
      return null;
    } catch (error) {
      console.error('Date formatting error:', error);
      return null;
    }
  };



  module.exports = {
    excelSerialDateToJSDate,
    dateFormatForDatabaseRequest,
  }