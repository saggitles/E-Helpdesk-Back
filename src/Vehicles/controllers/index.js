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
const NodeCache = require('node-cache');
const vehicleCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 minute TTL


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
  
      const query = `SELECT DISTINCT "USER_CD" AS customer_id, "USER_NAME" AS customer_name FROM "public"."FMS_CUST_MST" ORDER BY "USER_NAME" ASC;
`;
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
    
    console.log("Request parameters:", { site, customer, gmptCode });
    
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
      
      // Get vehicle IDs first
      let vehicleCDs = [];
      
      if (gmptCode) {
        console.log("Fetching by GMPT code:", gmptCode);
        // Modified to use LIKE for partial matching
      const cdQuery = `SELECT "VEHICLE_CD" FROM "FMS_VEHICLE_MST" WHERE "VEHICLE_ID" ILIKE $1;`;
      // Add wildcards around gmptCode for substring matching
      const cdResult = await client.query(cdQuery, [`%${gmptCode}%`]);
        vehicleCDs = cdResult.rows.map(row => row.VEHICLE_CD);
        
      } else if (site && site !== 'undefined' && site !== '') {
        console.log("Fetching by site:", site);
        const siteQuery = `SELECT "VEHICLE_CD" FROM "FMS_USR_VEHICLE_REL" WHERE "LOC_CD" = $1;`;
        const siteResult = await client.query(siteQuery, [site]);
        vehicleCDs = siteResult.rows.map(row => row.VEHICLE_CD);
        
      } else {
        console.log("Fetching by customer:", customer);
        const customerQuery = `SELECT "VEHICLE_CD" FROM "FMS_USR_VEHICLE_REL" WHERE "USER_CD" = $1;`;
        const customerResult = await client.query(customerQuery, [customer]);
        vehicleCDs = customerResult.rows.map(row => row.VEHICLE_CD);
      }
  
      console.log(`Found ${vehicleCDs.length} vehicles`);
      
      if (vehicleCDs.length === 0) {
        return res.status(404).json({ error: "No vehicles found" });
      }
  
      // Fetch basic vehicle info
      const vehicleInfo = await fetchVehicleInfo(client, vehicleCDs);
  
      // Immediately return basic vehicle info
      const basicData = vehicleInfo.map(vehicle => ({
        ...vehicle,
      }));
  
      return res.status(200).json(basicData);
  
    } catch (err) {
      console.error("Database Query Failed:", err.message);
      return res.status(500).json({ error: "Database query failed", details: err.message });
    } finally {
      await client.end();
    }
  };

  exports.getMasterCodes = async (req, res) => {
    const { vehicleCDs } = req.body;
    
    if (!vehicleCDs || !Array.isArray(vehicleCDs) || vehicleCDs.length === 0) {
      return res.status(400).json({ error: "Valid vehicle IDs array is required" });
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
      
      // Result object to store master codes for each vehicle
      const result = {};
      
      for (const vehicleCD of vehicleCDs) {
        try {
          const query = `
            SELECT fvo."VEHICLE_CD", jsonb_build_object('masterCodeUser', fum."USER_NAME") AS master_code
            FROM "FMS_VEHICLE_OVERRIDE" fvo
            JOIN "FMS_USR_MST" fum ON fvo."USER_CD" = fum."USER_CD"
            WHERE fvo."VEHICLE_CD" = ANY($1);
          `;
          
          const queryResult = await client.query(query, [vehicleCD]);
          
          result[vehicleCD] = queryResult.rows.map(row => ({
            master_code_user: row.master_code.masterCodeUser,

          }));
        } catch (err) {
          console.error(`Error getting master codes for vehicle ${vehicleCD}: ${err.message}`);
          // Initialize with empty array if there's an error
          result[vehicleCD] = [];
        }
      }
      
      return res.status(200).json(result);
    } catch (err) {
      console.error("Error fetching master codes:", err.message);
      return res.status(500).json({ 
        error: "Failed to fetch master codes", 
        details: err.message 
      });
    } finally {
      await client.end();
    }
  };
  
  exports.getBlacklistedDrivers = async (req, res) => {
    const { vehicleCDs } = req.body;
    
    if (!vehicleCDs || !Array.isArray(vehicleCDs) || vehicleCDs.length === 0) {
      return res.status(400).json({ error: "Valid vehicle IDs array is required" });
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
      
      // Result object to store blacklisted drivers for each vehicle
      const result = {};
      
      for (const vehicleCD of vehicleCDs) {
        try {
          const query = `
            SELECT fdb."VEHICLE_CD", jsonb_build_object('blacklistedDriver', fum_blacklist."USER_NAME") AS blacklisted_driver
            FROM "FMS_DRIVER_BLKLST" fdb
            JOIN "FMS_USR_MST" fum_blacklist ON fdb."USER_CD" = fum_blacklist."USER_CD"
            WHERE fdb."VEHICLE_CD" = ANY($1);
          `;
          
          const queryResult = await client.query(query, [vehicleCD]);
          
          result[vehicleCD] = queryResult.rows.map(row => ({
            driver_name: row.blacklisted_driver.blacklistedDriver,
          }));
        } catch (err) {
          console.error(`Error getting blacklisted drivers for vehicle ${vehicleCD}: ${err.message}`);
          // Initialize with empty array if there's an error
          result[vehicleCD] = [];
        }
      }
      
      return res.status(200).json(result);
    } catch (err) {
      console.error("Error fetching blacklisted drivers:", err.message);
      return res.status(500).json({ 
        error: "Failed to fetch blacklisted drivers", 
        details: err.message 
      });
    } finally {
      await client.end();
    }
  };


  exports.getVehicleLogins = async (req, res) => {
    const { vehicleCDs } = req.body;
    
    if (!vehicleCDs || !Array.isArray(vehicleCDs) || vehicleCDs.length === 0) {
      return res.status(400).json({ error: "Valid vehicle IDs array is required" });
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
      
      const vehicleLogins = await fetchVehicleLogins(client, vehicleCDs);
      
      return res.status(200).json(vehicleLogins);
    } catch (err) {
      console.error("Error fetching card swipes:", err.message);
      return res.status(500).json({ 
        error: "Failed to fetch card swipes", 
        details: err.message 
      });
    } finally {
      await client.end();
    }
  };

  exports.getMessagesSent = async (req, res) => {
    const { vehicleCDs } = req.body; // These are actually GMPT codes
    console.log('vehicleCDs from my messages', vehicleCDs);
    
    if (!vehicleCDs || !Array.isArray(vehicleCDs) || vehicleCDs.length === 0) {
      return res.status(400).json({ error: "Valid vehicle IDs array is required" });
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
      
      // Result object to store messages for each vehicle
      const result = {};
      
      for (const vehicleCD of vehicleCDs) {
        try {
          
          const query = `
            WITH veh_id_cte AS (
            SELECT "VEHICLE_ID"
            FROM "FMS_VEHICLE_MST"
            WHERE "VEHICLE_CD" = $1
          )
          SELECT
            TO_CHAR(o."timestamp" AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI:SS') AS message_timestamp,
            o."message" AS message_text,
            'in_queue' AS status
          FROM "outgoing" o
          JOIN veh_id_cte v ON o."destination" = v."VEHICLE_ID"
          WHERE o."timestamp" >= NOW() - INTERVAL '7 days'

          UNION ALL

          SELECT
            TO_CHAR(os."timestamp_s_local" AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI:SS') AS message_timestamp,
            os."message_s" AS message_text,
            'done' AS status
          FROM "outgoing_stat" os
          JOIN veh_id_cte v ON os."destination_s" = v."VEHICLE_ID"
          WHERE os."timestamp_s_local" >= NOW() - INTERVAL '3 days'

          ORDER BY
            message_timestamp DESC,
            status;
          `;
          
          const queryResult = await client.query(query, [vehicleCD]);
          console.log('Query result:', queryResult.rows);
          
          result[vehicleCD] = [];
          if (queryResult.rows.length > 0) {
            // Clean the raw timestamp field before sending to frontend
            const cleanedRows = queryResult.rows.map(row => {
              // Extract message type from the message string
              let message_type = 'Unknown';
              const msgStr = row.message_text ? row.message_text.toLowerCase() : '';
              console.log('msgStr', msgStr);

              if (msgStr.includes('dlist.txt')) {
                message_type = 'Driver List';
              } else if (msgStr.includes('preop')) {
                message_type = 'Pre-Op Checklist';
              } else if (msgStr.includes('idmast')) {
                message_type = 'Master Code';
              } else if (msgStr.includes('idauth')) {
                message_type = 'User Weigand';
              } else if (msgStr.includes('idsave')) {
                message_type = 'idk';
              } else if (msgStr.includes('idbatch')) {
                message_type = 'idk';
              } else if (msgStr.includes('msg')) {
                message_type = 'Message';
              } else if (msgStr.includes('iddeny')) {
                message_type = 'Denied Weigand';
              } else if (msgStr.includes('wifi')) {
                message_type = 'WIFI credentials';
              } else if (msgStr.includes('amimp')) {
                message_type = 'Amber Warning';
              } else if (msgStr.includes('lockout')) {
                message_type = 'Full Lockout';
              } else if (msgStr.includes('fssx')) {
                message_type = 'Impact Gforce value';
              } else if (msgStr.includes('idle')) {
                message_type = 'Vehicle Idle';
              } else if (msgStr.includes('digcfg')) {
                message_type = 'Seen Safety';
              } else if (msgStr.includes('chkt')) {
                message_type = 'Checklist Scheduled Time';
              } else if (msgStr.includes('convor')) {
                message_type = 'VOR Mode';
              } else if (msgStr.includes('oprndm')) {
                message_type = 'Checklist Randomisation';
              } else if (msgStr.includes('showpc')) {
                message_type = 'Show checklist comments';
              } else if (msgStr.includes('surv')) {
                message_type = 'Checklist Timeout';
              } else if (msgStr.includes('tlist.txt')) {
                message_type = 'Technician List';
              }
              
               
              

              
              // Return a new object with the formatted data
              return {
                message_text: row.message_text,
                status: row.status,
                message_type,
                message_timestamp: row.message_timestamp
              };
            });
            
            result[vehicleCD] = cleanedRows;
            console.log(`Fetched ${cleanedRows.length} messages for vehicle ${vehicleCD}`, cleanedRows);
          }
        } catch (err) {
          console.error(`Error getting messages for vehicle ${vehicleCD}: ${err.message}`);
          // Initialize with empty array if there's an error
          result[vehicleCD] = [];
        }
      }
      
      return res.status(200).json(result);
    } catch (err) {
      console.error("Error in getMessagesSent:", err.message);
      return res.status(500).json({ error: "Failed to fetch messages", details: err.message });
    } finally {
      await client.end();
    }
  };


  // Add this controller function
exports.getLastDriverLogins = async (req, res) => {
  const { vehicleCDs } = req.body;
  
  if (!vehicleCDs || !Array.isArray(vehicleCDs) || vehicleCDs.length === 0) {
    return res.status(400).json({ error: "Valid vehicle IDs array is required" });
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
    
    // Make a simplified version that's less likely to error
    const result = {};
    
    for (const vehicleCD of vehicleCDs) {
      try {
        // Get just the most recent login for each vehicle
        const query = `
          SELECT DISTINCT ON (fcv."DRIVER_ID")
          CASE 
            WHEN fum."CONTACT_FIRST_NAME" IS NULL OR fum."CONTACT_LAST_NAME" IS NULL 
              THEN 'No Driver'
            ELSE fum."CONTACT_FIRST_NAME" || ' ' || fum."CONTACT_LAST_NAME"
          END AS driver_name,
          fcv."DRIVER_ID" as driver_id,
          TO_CHAR(fcv."SWIPE_TIME", 'DD/MM/YYYY HH24:MI:SS') as login_time,
          fcv."ACCEPTED" as accepted,
          fcv."SWIPE_TIME" as raw_timestamp
        FROM "FMS_CARD_VERIFICATION" fcv
        LEFT JOIN "FMS_USR_MST" fum ON fcv."DRIVER_ID" = fum."CARD_ID" 
        WHERE fcv."VEH_CD" = $1
          AND fcv."ACCEPTED" = TRUE
        ORDER BY fcv."DRIVER_ID", fcv."SWIPE_TIME" DESC
        LIMIT 10
        `;
        
const queryResult = await client.query(query, [vehicleCD]);

result[vehicleCD] = [];
if (queryResult.rows.length > 0) {
  const sortedRows = queryResult.rows.sort((a, b) => {
    return new Date(b.raw_timestamp) - new Date(a.raw_timestamp);
  });
  
  const cleanedRows = sortedRows.map(row => {
    const {  ...cleanRow } = row;
    return cleanRow;
  });
  
  result[vehicleCD] = cleanedRows;
}
      } catch (err) {
        console.error(`Error getting last driver login for vehicle ${vehicleCD}: ${err.message}`);
        // Initialize with empty array if there's an error
        result[vehicleCD] = [];
      }
    }
    
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in getLastDriverLogins:", err.message);
    return res.status(500).json({ error: "Failed to fetch last driver logins", details: err.message });
  } finally {
    await client.end();
  }
};

  exports.clearVehicleCache = async (req, res) => {
    try {
      console.log('Clearing vehicle cache');
      vehicleCache.flushAll();
      return res.status(200).json({ message: 'Cache cleared successfully' });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to clear cache', details: error.message });
    }
  };



  
  // ✅ Fetch Basic Vehicle Info
  async function fetchVehicleInfo(client, vehicleCDs) {
    const query = `
                  SELECT DISTINCT ON (fvm."VEHICLE_CD")
                  fvm."VEHICLE_CD",
                  jsonb_build_object(
                    'vehicle_name', ev."hire_no",
                    'serial_number', ev."serial_no",
                    'gmpt_code', fvm."VEHICLE_ID",
                    'firmware_version', ev."firmware_ver",
                    'screen_version', ev."product_type",
                    'expansion_version', ev."exp_mod_ver",
                    'last_connection', TO_CHAR(fvm."LAST_EOS", 'DD/MM/YYYY HH24:MI'),
                    'department', fdm."DEPT_NAME",
                    'vor_setting', fvm."vor_setting",
                    'lockout_code', fvm."lockout_code",
                    'impact_lockout', fvm."IMPACT_LOCKOUT",
                    'survey_timeout', fvm."survey_timeout",
                    'seat_idle', fvm."seat_idle",
                    'red_impact_threshold', ROUND(CAST(0.00388 * SQRT(GREATEST(fvm."FSSS_BASE", 0) * GREATEST(fvm."FSSSMULTI", 0) * 10) AS NUMERIC), 3),
                    'impact_recalibration_date', TO_CHAR(ews."impact_recalibration_date", 'DD/MM/YYYY HH24:MI'),
                    'preop_schedule', ews."preop_schedule",
                    'sim_number', fvm."CCID",
                    'vehicle_type', fvm."VEHICLE_TYPE_CD",
                    'vehicle_model', vt."VEHICLE_TYPE",
                    'status', fsd."status",
                    'full_lockout_enabled', fvm."full_lockout_enabled",
                    'full_lockout_timeout', fvm."full_lockout_timeout",
                    'customer_name', cust."USER_NAME",
                    'site_name', loc."NAME",
                    'has_wifi', ns."veh_cd" IS NOT NULL,
                    'last_dlist_timestamp', dlist."timestamp_s",
                    'last_preop_timestamp', preop."timestamp_s"
                  ) AS vehicle_info

                FROM "FMS_VEHICLE_MST" fvm
                LEFT JOIN "equipment_view" ev ON ev."gmtp_id" = fvm."VEHICLE_ID"
                LEFT JOIN "FMS_USR_VEHICLE_REL" fuvr ON fuvr."VEHICLE_CD" = fvm."VEHICLE_CD"
                LEFT JOIN "FMS_DEPT_MST" fdm ON fdm."DEPT_CD" = fuvr."DEPT_CD"
                LEFT JOIN "FMS_CUST_MST" cust ON cust."USER_CD" = fuvr."USER_CD"
                LEFT JOIN "FMS_LOC_MST" loc ON loc."LOCATION_CD" = fuvr."LOC_CD"
                LEFT JOIN "equipment_website_settings" ews ON ews."gmtp_id" = fvm."VEHICLE_ID"
                LEFT JOIN "FMS_VEHICLE_TYPE_MST" vt ON vt."VEHICLE_TYPE_CD" = fvm."VEHICLE_TYPE_CD"
                LEFT JOIN "veh_network_settings" ns ON ns."veh_cd" = fvm."VEHICLE_CD"

                -- Estado actual
                LEFT JOIN LATERAL (
                SELECT 
                  CASE 
                    WHEN NOW() - "utc_time" > INTERVAL '60 minutes' THEN 'offline'
                    ELSE 'online'
                  END AS status
                FROM "fms_stat_data"
                WHERE "vehicle_cd" = fvm."VEHICLE_CD"
                AND "date_time" > NOW() - INTERVAL '1 day'  
                ORDER BY "date_time" DESC
                LIMIT 1
              ) fsd ON TRUE

                -- Último dlist.txt
                LEFT JOIN LATERAL (
                  SELECT TO_CHAR("timestamp_s", 'DD/MM/YYYY HH24:MI') AS "timestamp_s"
                  FROM "outgoing_stat"
                  WHERE "destination_s" = fvm."VEHICLE_ID" 
                    AND "message_s" ILIKE '%dlist.txt%'
                  ORDER BY "timestamp_s" DESC
                  LIMIT 1
                ) dlist ON TRUE

                -- Último PREOP.TXT
                LEFT JOIN LATERAL (
                  SELECT TO_CHAR("timestamp_s", 'DD/MM/YYYY HH24:MI') AS "timestamp_s"
                  FROM "outgoing_stat"
                  WHERE "destination_s"= fvm."VEHICLE_ID"
                    AND "message_s" ILIKE '%PREOP%'
                  ORDER BY "timestamp_s" DESC
                  LIMIT 1
                ) preop ON TRUE

                WHERE fvm."VEHICLE_CD" = ANY($1)
                ORDER BY fvm."VEHICLE_CD", fuvr."USER_CD" NULLS LAST;



    `;
  
    const result = await client.query(query, [vehicleCDs]);
    console.log('Fetching new vehicles...',result.rows)
  
    return result.rows;
  }

  async function fetchVehicleLogins(client, vehicleCDs) {
    // Process each vehicle ID individually to build proper WITH clauses
    const allLogins = {};
    
    for (const vehicleCD of vehicleCDs) {
      const query = `
        
      WITH "vehicle_user" AS (
        SELECT "USER_CD"
        FROM "FMS_USR_VEHICLE_REL"
        WHERE "VEHICLE_CD" = $1
      ),
      "recent_swipes" AS (
        SELECT "DRIVER_ID", "VEH_CD", "SWIPE_TIME", "ACCEPTED"
        FROM "FMS_CARD_VERIFICATION"
        WHERE "VEH_CD" = $1
          AND "SWIPE_TIME" >= CURRENT_DATE - INTERVAL '3 days'
      ),
      "card_users" AS (
        SELECT
            "rs"."DRIVER_ID",
            "rs"."SWIPE_TIME",
            "rs"."ACCEPTED",
            "us"."USER_CD",
            "us"."CARD_ID",
            "us"."CARD_PREFIX",
            "us"."CONTACT_FIRST_NAME",
            "us"."CONTACT_LAST_NAME"
        FROM "recent_swipes" "rs"
        LEFT JOIN "FMS_USR_MST" "us" ON "us"."CARD_ID" = "rs"."DRIVER_ID"
      ),
      "matched_users" AS (
        SELECT 
            "cu"."DRIVER_ID",
            "cu"."SWIPE_TIME",
            "cu"."ACCEPTED",
            "cu"."USER_CD",
            "cu"."CARD_PREFIX",
            "cu"."CONTACT_FIRST_NAME",
            "cu"."CONTACT_LAST_NAME"
        FROM "card_users" "cu"
        LEFT JOIN "FMS_USER_DEPT_REL" "ur" ON "cu"."USER_CD" = "ur"."USER_CD"
        WHERE "ur"."CUST_CD" = (SELECT "USER_CD" FROM "vehicle_user") OR "cu"."USER_CD" IS NULL
      )
      SELECT
        CASE 
            WHEN "CONTACT_FIRST_NAME" IS NULL OR "CONTACT_LAST_NAME" IS NULL 
                THEN 'No Driver'
            ELSE "CONTACT_FIRST_NAME" || ' ' || "CONTACT_LAST_NAME"
        END AS driver_name,
        "DRIVER_ID" as driver_id,
        TO_CHAR("SWIPE_TIME", 'DD/MM/YYYY HH24:MI:SS') as login_time,
        "CARD_PREFIX" as facility_code,
        "ACCEPTED" as accepted
      FROM "matched_users"
      ORDER BY "SWIPE_TIME" DESC;
    `;
  
      const result = await client.query(query, [vehicleCD]);
      //console.log('Fetching vehicle logins for vehicle:', vehicleCD, result.rows);
      
      allLogins[vehicleCD] = result.rows.map(row => row);
    }
    
    return allLogins;
  }

  

const dbConfig = {
    host: '192.168.0.30',
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
  

  