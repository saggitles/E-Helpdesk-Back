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
app.use(express.json());
const vehicleServices = require('../services/')
const { Client } = require('pg');


exports.getCustomers = async (req, res) => {
    console.log('Fetching customers...');
    const client = new Client({
      host: 'db-fleetiq-encrypt-01.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
      port: 5432,
      database: 'multi',
      user: 'gmtp',
      password: 'MUVQcHz2DqZGHvZh'
    });
  
    try {
      await client.connect(); // Establish connection
  
      const query = `SELECT DISTINCT "USER_CD" as customer_id, "USER_NAME" as customer_name FROM "public"."FMS_CUST_MST"`;
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
      console.error("Error: Missing customer parameter");
      return res.status(400).json({ error: "Customer parameter is required" });
    }
  
    // Parse customer parameter
    let customerId;
    try {
      const customerData = typeof customer === 'string' ? 
        JSON.parse(customer) : customer;
      
      customerId = customerData.customer_id || parseInt(customerData, 10);
    } catch (e) {
      customerId = parseInt(customer, 10);
    }
  
    if (isNaN(customerId)) {
      console.error("Error: Invalid customer ID format, received:", customer);
      return res.status(400).json({ error: "Invalid customer ID format" });
    }
  
    try {
      const client = new Client({
        host: 'db-fleetiq-encrypt-01.cmjwsurtk4tn.us-east-1.rds.amazonaws.com',
        port: 5432,
        database: 'multi',
        user: 'gmtp',
        password: 'MUVQcHz2DqZGHvZh'
      });
  
      await client.connect();
      
      const query = `
        SELECT DISTINCT FLM."LOCATION_CD" as site_id, FLM."NAME" as site_name
        FROM "FMS_USR_VEHICLE_REL" FUVR
        JOIN "FMS_LOC_MST" FLM ON FUVR."LOC_CD" = FLM."LOCATION_CD"
        WHERE FUVR."USER_CD" = $1
      `;
  
      const result = await client.query(query, [customerId]);
      await client.end();
  
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error("Database Query Failed:", err);
      return res.status(500).json({ 
        error: "Database query failed", 
        details: err.message 
      });
    }
  };
  
  exports.getVehicles = async (req, res) => {
    const { site, customer, gmptCode } = req.query;
    /*FIXME: Eliminar despues de comprender
    en los nuevos controladores seria algo asi
  
    if (!customer && !gmptCode) {
      return res.status(400).json({ error: "Customer or GMPT Code is required" });
    }
    const getVehicles = await vehiclesService.getVehicleService(req.query)
  
    // in folder Vehicle/services/index
    const { site, customer, gmptCode } = req.query;
    */
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
                  'customer_name', cust."USER_NAME",
                  'site_name', loc."NAME"
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

const dbConfig = {
    host: '192.168.0.28',
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
          acc[vCode] = { before: {}, after: {} };
        }
        if (row.snapshot_time === time1) {
          acc[vCode].before = row;
        } else if (row.snapshot_time === time2) {
          acc[vCode].after = row;
  
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
  
  
  
  
  const { Parser } = require('json2csv');
  