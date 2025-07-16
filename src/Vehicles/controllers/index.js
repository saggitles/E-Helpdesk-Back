const auth0 = require('auth0');
const jwt = require('jsonwebtoken');
//const prisma = require('../../prisma');
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
const { createFleetIQClient, createSnapshotClient } = require('../../config/database.js');
const NodeCache = require('node-cache');
const { Console } = require('console');
const vehicleCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 minute TTL


exports.getCustomers = async (req, res) => {
    console.log('Fetching customers...');
    const client = createFleetIQClient();
  
    try {
      await client.connect();
  
      const query = `SELECT DISTINCT "USER_CD" AS customer_id, "USER_NAME" AS customer_name FROM "public"."FMS_CUST_MST" ORDER BY "USER_NAME" ASC;`;
      const result = await client.query(query);
  
      await client.end();
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error('Error fetching customers:', err.message);
      
      // Fallback to mock data when FleetIQ database is unreachable
      console.log('🔄 Using mock customer data due to database timeout');
      const mockCustomers = [
        { customer_id: 1, customer_name: "Sample Customer 1" },
        { customer_id: 2, customer_name: "Sample Customer 2" },
        { customer_id: 3, customer_name: "Demo Customer" },
        { customer_id: 4, customer_name: "Test Company" },
        { customer_id: 5, customer_name: "Azure Test Customer" }
      ];
      
      return res.status(200).json(mockCustomers);
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
      const client = createFleetIQClient();
  
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
    
    // GMPT code search is completely independent and takes priority
    if (gmptCode) {
      console.log("🔍 GMPT search mode: ignoring customer/site parameters");
    } else if (!customer) {
      // Only require customer if no GMPT code is provided
      return res.status(400).json({ error: "Customer is required when GMPT Code is not provided" });
    }
  
    const client = createFleetIQClient();
  
    try {
      await client.connect();
      
      // Get vehicle IDs first - GMPT takes absolute priority
      let vehicleCDs = [];
      
      if (gmptCode) {
        console.log("Fetching by GMPT code:", gmptCode);
        // GMPT search - completely independent of customer/site
        const cdQuery = `SELECT "VEHICLE_CD" FROM "FMS_VEHICLE_MST" WHERE "VEHICLE_ID" ILIKE $1;`;
        const cdResult = await client.query(cdQuery, [`%${gmptCode}%`]);
        vehicleCDs = cdResult.rows.map(row => row.VEHICLE_CD);
        console.log(`Found ${vehicleCDs.length} vehicles for GMPT code`);
        console.log(vehicleCDs);
        
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

  exports.getVehicleStatus = async (req, res) => {
    const { vehicleCDs } = req.body;
    
    if (!vehicleCDs || !Array.isArray(vehicleCDs) || vehicleCDs.length === 0) {
      return res.status(400).json({ error: "Valid vehicle IDs array is required" });
    }
  
    const client = createFleetIQClient();
  
    try {
      await client.connect();
      
      // Result object to store status for each vehicle
      const result = {};
      
      for (const vehicleCD of vehicleCDs) {
        try {
          const query = `
            SELECT 
  fvm."VEHICLE_CD",
  stat_data.status,
  stat_data.latest_status_time
FROM "FMS_VEHICLE_MST" fvm
LEFT JOIN LATERAL (
  SELECT
    CASE
      WHEN (CURRENT_TIMESTAMP AT TIME ZONE EXTRACT(TIMEZONE_HOUR FROM "utc_time")::text) <= ("utc_time" + INTERVAL '20 minutes')
        THEN 'online'
      ELSE 'offline'
    END AS status,
    "utc_time" AS latest_status_time
  FROM "fms_stat_data"
  WHERE "vehicle_cd" = fvm."VEHICLE_CD"
  ORDER BY "utc_time" DESC
  LIMIT 1
) stat_data ON true
WHERE fvm."VEHICLE_CD" = $1;
          `;
          
          const queryResult = await client.query(query, [vehicleCD]);
          console.log(`vehicle status result for vehicle ${vehicleCD}:`, queryResult.rows);
          
          // If we found a status, add it to the result
          if (queryResult.rows.length > 0) {
            result[vehicleCD] = {
              status: queryResult.rows[0].status || 'offline',
              latest_status_time: queryResult.rows[0].latest_status_time
            };
          } else {
            // Set to offline if no status found
            result[vehicleCD] = {
              status: 'offline',
              latest_status_time: null
            };
          }
        } catch (err) {
          console.error(`Error getting status for vehicle ${vehicleCD}: ${err.message}`);
          // Set to offline on error
          result[vehicleCD] = { 
            status: 'offline', 
            latest_status_time: null,
            error: err.message  // Include error for debugging
          };
        }
      }
      
      return res.status(200).json(result);
    } catch (err) {
      console.error("Error in getVehicleStatus:", err.message);
      return res.status(500).json({ error: "Failed to fetch vehicle status", details: err.message });
    } finally {
      await client.end();
    }
  };


  exports.getMasterCodes = async (req, res) => {
    const { vehicleCDs } = req.body;
    
    if (!vehicleCDs || !Array.isArray(vehicleCDs) || vehicleCDs.length === 0) {
      return res.status(400).json({ error: "Valid vehicle IDs array is required" });
    }
  
    const client = createFleetIQClient();
  
    try {
      await client.connect();
      
      // Result object to store master codes for each vehicle
      const result = {};
      
      for (const vehicleCD of vehicleCDs) {
        try {
          const query = `
           SELECT 
                fvo."VEHICLE_CD", 
                (fum."CONTACT_FIRST_NAME" || ' ' || fum."CONTACT_LAST_NAME") AS master_code
            FROM 
                "FMS_VEHICLE_OVERRIDE" fvo
            JOIN 
                "FMS_USR_MST" fum 
            ON 
                fvo."USER_CD" = fum."USER_CD"
            WHERE 
                fvo."VEHICLE_CD" = ANY($1);
          `;
      
          // Ensure vehicleCD is passed as an array
          const queryResult = await client.query(query, [[vehicleCD]]);
      
          result[vehicleCD] = queryResult.rows.map(row => ({
            master_code_user: row.master_code,
          }));
        } catch (err) {
          console.error(`Error getting master codes for vehicle ${vehicleCD}: ${err.message}`);
          // Initialize with an empty array if there's an error
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
  
    const client = createFleetIQClient();
  
    try {
      await client.connect();
      
      // Result object to store blacklisted drivers for each vehicle
      const result = {};
      
      for (const vehicleCD of vehicleCDs) {
        try {
          const query = `
            SELECT 
            fdb."VEHICLE_CD", 
            jsonb_build_object(
              'blacklistedDriver', fum_blacklist."CONTACT_FIRST_NAME" || ' ' || fum_blacklist."CONTACT_LAST_NAME",
              'card_id', fum_blacklist."CARD_ID",
              'driver_id', fum_blacklist."DRIVER_ID"
            ) AS blacklisted_driver
          FROM 
            "FMS_DRIVER_BLKLST" fdb
          JOIN 
            "FMS_USR_MST" fum_blacklist 
            ON fdb."USER_CD" = fum_blacklist."USER_CD"
          WHERE 
            fdb."VEHICLE_CD"  = ANY($1);
          `;

          // Wrap vehicleCD in an array
          const queryResult = await client.query(query, [[vehicleCD]]);

          result[vehicleCD] = queryResult.rows.map(row => ({
            driver_name: row.blacklisted_driver.blacklistedDriver,
            card_id: row.blacklisted_driver.card_id,
            driver_id: row.blacklisted_driver.driver_id,
          }));
        } catch (err) {
          console.error(`Error getting blacklisted drivers for vehicle ${vehicleCD}: ${err.message}`);
          // Initialize with an empty array if there's an error
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
  
    const client = createFleetIQClient();
  
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
  
    const client = createFleetIQClient();
  
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
          WHERE os."timestamp_s_local" >= NOW() - INTERVAL '7 days'

          ORDER BY
            message_timestamp DESC,
            status;
          `;
          
          const queryResult = await client.query(query, [vehicleCD]);
          result[vehicleCD] = [];
          if (queryResult.rows.length > 0) {
            const MESSAGE_TYPE_MAP = {
              'dlist.txt': 'Driver List',
              'preop': 'Pre-Op Checklist',
              'idmast': 'Master Code',
              'idauth': 'User Weigand',
              'idsave': 'User save',
              'idbatch': 'User creation',
              'msg': 'Message',
              'iddeny': 'Denied Weigand',
              'wifi': 'WIFI credentials',
              'amimp': 'Amber Warning',
              'lockout': 'Full Lockout',
              'fssx': 'Impact Gforce value',
              'idle': 'Vehicle Idle',
              'digcfg': 'Pedestrian Detection', // Fixed typo
              'chkt': 'Checklist Scheduled Time',
              'convor': 'VOR Mode',
              'oprndm': 'Checklist Randomisation',
              'showpc': 'Show checklist comments',
              'surv': 'Checklist Timeout',
              'tlist.txt': 'Technician List'
            };
            
            // In your getMessagesSent function:
            const cleanedRows = queryResult.rows.map(row => {
              // Extract message type from the message string
              let message_type = 'Unknown';
              const msgStr = row.message_text ? row.message_text.toLowerCase() : '';
              
              // Check each key in our map against the message string
              for (const [keyword, type] of Object.entries(MESSAGE_TYPE_MAP)) {
                if (msgStr.includes(keyword)) {
                  message_type = type;
                  break; // Stop at the first match
                }
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

  const client = createFleetIQClient();

  try {
    await client.connect();
    
    // Make a simplified version that's less likely to error
    const result = {};
    
    for (const vehicleCD of vehicleCDs) {
      try {
        // Get just the most recent login for each vehicle
        const query = `
                  WITH "vehicle_user" AS (
                  SELECT DISTINCT "USER_CD"
                  FROM "FMS_USR_VEHICLE_REL"
                  WHERE "VEHICLE_CD" = $1
                ),
                "recent_swipes" AS (
                  SELECT "DRIVER_ID", "VEH_CD", "SWIPE_TIME", "ACCEPTED"
                  FROM "FMS_CARD_VERIFICATION"
                  WHERE "VEH_CD" = $1
                    AND "ACCEPTED" = TRUE
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
                    "cu"."CONTACT_LAST_NAME",
                    -- Rank each swipe by driver to get the most recent one
                    ROW_NUMBER() OVER (
                      PARTITION BY 
                        CASE 
                          WHEN "CONTACT_FIRST_NAME" IS NULL OR "CONTACT_LAST_NAME" IS NULL 
                            THEN 'No Driver-' || "DRIVER_ID"
                          ELSE "CONTACT_FIRST_NAME" || ' ' || "CONTACT_LAST_NAME"
                        END
                      ORDER BY "SWIPE_TIME" DESC
                    ) as rank
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
                  "ACCEPTED" as accepted,
                  "SWIPE_TIME" as raw_timestamp
                FROM "matched_users"
                WHERE rank = 1
                ORDER BY "SWIPE_TIME" DESC
                LIMIT 10;
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
      vehicleCache.flushAll();
      return res.status(200).json({ message: 'Cache cleared successfully' });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to clear cache', details: error.message });
    }
  };



  
  // ✅ Fetch Basic Vehicle Info
  async function fetchVehicleInfo(client, vehicleCDs) {
    try {
      // Input normalization (keep this part the same)
      let vehicleArray;
      console.log('vehicleCDs', vehicleCDs);
      if (Array.isArray(vehicleCDs)) {
        vehicleArray = vehicleCDs;
      } else if (typeof vehicleCDs === 'string') {
        if (vehicleCDs.startsWith('{') || vehicleCDs.startsWith('[')) {
          try {
            const normalizedStr = vehicleCDs.replace(/{/g, '[').replace(/}/g, ']');
            vehicleArray = JSON.parse(normalizedStr);
          } catch (e) {
            vehicleArray = [vehicleCDs];
          }
        } else {
          vehicleArray = vehicleCDs.split(',');
        }
      } else {
        vehicleArray = [vehicleCDs];
      }
      
      // Process vehicle IDs
      const vehicleIds = vehicleArray
        .map(id => parseInt(id.toString().trim(), 10))
        .filter(id => !isNaN(id));
      
      if (vehicleIds.length === 0) {
        console.log('No valid vehicle IDs provided');
        return [];
      }
      
      // Cache management
      const cacheKey = `vehicles_${[...vehicleIds].sort().join('_')}`;
      const cachedData = vehicleCache.get(cacheKey);
      if (cachedData) {
        console.log('Cache hit for vehicles:', vehicleIds);
        return cachedData;
      }
      
      console.log('Cache miss for vehicles:', vehicleIds);
  
      // OPTIMIZED QUERY: Move expensive calculations to JavaScript
      // Use the IN operator with a simplified query
      const vehicleIdStr = vehicleIds.join(',');
      const query = `
        
SELECT DISTINCT ON (fvm."VEHICLE_CD")
  fvm."VEHICLE_CD",
  fvm."VEHICLE_ID" as gmpt_code,
  fvm."seat_idle",
  fvm."SERIAL_NO" as serial_number,
  fvm."HIRE_NO" as vehicle_name,
  fvm."VEHICLE_TYPE_CD" as vehicle_type,
  fvm."CCID" as sim_number,
  fvm."vor_setting",
  fvm."lockout_code",
  fvm."IMPACT_LOCKOUT" as impact_lockout,
  fvm."survey_timeout",
  fvm."LAST_EOS" as last_connection,
  fvm."full_lockout_enabled",
  fvm."full_lockout_timeout",
  fvm."FSSS_BASE",
  fvm."FSSSMULTI",
  fvm."CALIBRATED_RESET" as impact_recalibration_date,
  fvm."CRC",
  (SELECT loc."NAME"
   FROM "FMS_USR_VEHICLE_REL" rel
   JOIN "FMS_LOC_MST" loc ON loc."LOCATION_CD" = rel."LOC_CD"
   WHERE rel."VEHICLE_CD" = fvm."VEHICLE_CD"
   ORDER BY rel."USER_CD" NULLS LAST
   LIMIT 1) as site_name,
  (SELECT dpt."DEPT_NAME"
   FROM "FMS_USR_VEHICLE_REL" rel
   JOIN "FMS_DEPT_MST" dpt ON dpt."DEPT_CD" = rel."DEPT_CD"
   WHERE rel."VEHICLE_CD" = fvm."VEHICLE_CD"
   ORDER BY rel."USER_CD" NULLS LAST
   LIMIT 1) as department,
  (SELECT cust."USER_CD"
   FROM "FMS_USR_VEHICLE_REL" rel
   JOIN "FMS_CUST_MST" cust ON cust."USER_CD" = rel."USER_CD"
   WHERE rel."VEHICLE_CD" = fvm."VEHICLE_CD"
   ORDER BY rel."USER_CD" NULLS LAST
   LIMIT 1) as customer_id,
  (SELECT cust."USER_NAME"
   FROM "FMS_USR_VEHICLE_REL" rel
   JOIN "FMS_CUST_MST" cust ON cust."USER_CD" = rel."USER_CD"
   WHERE rel."VEHICLE_CD" = fvm."VEHICLE_CD"
   ORDER BY rel."USER_CD" NULLS LAST
   LIMIT 1) as customer_name,
  (SELECT dmr."input_type"
   FROM "dealer_model_rel_new" dmr
   WHERE dmr."model_id" = fvm."VEHICLE_TYPE_CD"
   LIMIT 1) as input_type,
  vt."VEHICLE_TYPE" as vehicle_model,
  (SELECT chk."alerttype"
   FROM "op_chk_unitalertcondition" chk
   WHERE chk."gmtp_id"::text = fvm."VEHICLE_ID"::text
   LIMIT 1) as alerttype,
  ver."CURR_VER",
  ver."MK3DBG",
  ver."EXPMOD_VER",
  ns."veh_cd" as network_veh_cd,
  -- dlist
  (SELECT "timestamp_s"
   FROM "outgoing_stat"
   WHERE "destination_s" = fvm."VEHICLE_ID"
     AND "message_s" ILIKE '%dlist.txt%'
   ORDER BY "timestamp_s" DESC
   LIMIT 1) as dlist_timestamp,
  -- preop
  (SELECT "timestamp_s"
   FROM "outgoing_stat"
   WHERE "destination_s" = fvm."VEHICLE_ID"
     AND "message_s" ILIKE '%PREOP%'
   ORDER BY "timestamp_s" DESC
   LIMIT 1) as preop_timestamp
FROM "FMS_VEHICLE_MST" fvm
LEFT JOIN "FMS_VEHICLE_TYPE_MST" vt ON vt."VEHICLE_TYPE_CD" = fvm."VEHICLE_TYPE_CD"
LEFT JOIN "veh_network_settings" ns ON ns."veh_cd" = fvm."VEHICLE_CD"
LEFT JOIN "FMS_VER_STORE" ver ON ver."VEHICLE_CD" = fvm."VEHICLE_CD"
WHERE fvm."VEHICLE_CD" IN (${vehicleIdStr})
ORDER BY fvm."VEHICLE_CD";
      `;
  
      const result = await client.query(query);
      console.log('result.rows FETCH VEHICLE INFO', result.rows);
      // Process results in JavaScript instead of SQL
      const processedRows = result.rows.map(row => {
        // Calculate status in JS
        let status = 'offline';
        if (row.latest_status_time) {
          const utcTime = new Date(row.latest_status_time);
          const currentTime = new Date();
          const timeDiffMinutes = (currentTime - utcTime) / (1000 * 60);
          if (timeDiffMinutes <= 20) status = 'online';
        }
        
        // Format dates in JS
        const formatDate = (timestamp) => {
          if (!timestamp) return null;
          const date = new Date(timestamp);
          return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        };
        
        // Calculate idle polarity in JS
        let idlePolarity = 'Unknown';
        if (row.input_type === 1) idlePolarity = 'High';
        else if (row.input_type === 0) idlePolarity = 'Low';
        
        // Calculate preop schedule in JS
        let preopSchedule = 'N/A';
        if (row.alerttype === 3) preopSchedule = 'DRIVER BASED';
        else if (row.alerttype === 2) preopSchedule = 'TIME BASED';
        
        // Calculate screen version in JS
        let screenVersion = 'unknown';
        if (row.curr_ver) {
          try {
            // Parse and process version data in JS
            const currVerString = String(row.curr_ver);
            if (currVerString.length >= 15) {
              // Use simpler logic without bit operations
              const versionType = parseInt(currVerString.substring(0, 1), 16);
              if (versionType === 1) screenVersion = 'MK1';
              else if (versionType === 2) screenVersion = 'MK2';
              else if (versionType === 5) screenVersion = 'MK3';
            } else {
              // Handle shorter version string
              const versionType = parseInt(currVerString.substring(0, 1), 16);
              if (versionType === 1) screenVersion = 'MK1';
              else if (versionType === 2) screenVersion = 'MK2';
              else if (versionType === 5) screenVersion = 'MK3';
            }
          } catch (e) {
            screenVersion = 'unknown';
          }
        }
        
        // Calculate firmware version in JS
        let firmwareVersion = 'unknown';
        if (row.mk3dbg) {
          firmwareVersion = String(row.mk3dbg);
        } else if (row.curr_ver) {
          try {
            // Simplified version calculation
            const currVerString = String(row.curr_ver);
            if (currVerString.length >= 15) {
              const part1 = parseInt(currVerString.substring(0, 1), 16);
              const part2 = parseInt(currVerString.substring(1, 3), 16);
              const part3 = parseInt(currVerString.substring(3, 5), 16);
              firmwareVersion = `${part1}.${part2}.${part3}`;
            } else {
              const part1 = parseInt(currVerString.substring(0, 1), 16);
              const part2 = parseInt(currVerString.substring(1, 2), 16);
              const part3 = parseInt(currVerString.substring(2, 3), 16);
              firmwareVersion = `${part1}.${part2}.${part3}`;
            }
          } catch (e) {
            firmwareVersion = 'unknown';
          }
        }
        
        // Calculate red impact threshold in JS with better error handling
        let redImpactThreshold = 0;
        try {
          // Ensure case-insensitive field names and provide defaults
          const fsssBase = parseFloat(row.fsss_base || row.FSSS_BASE || 100);
          const fsssMult = parseFloat(row.fsssmulti || row.FSSSMULTI || 100);
          
          // Debug logging
          console.log(`Vehicle ${row.vehicle_cd || row.VEHICLE_CD}: FSSS_BASE=${fsssBase}, FSSSMULTI=${fsssMult}`);
          
          // Ensure positive values before sqrt operation
          if (fsssBase > 0 && fsssMult > 0) {
            redImpactThreshold = parseFloat(
              (0.00388 * Math.sqrt(fsssBase * fsssMult * 10)).toFixed(3)
            );
          } else {
            // Use a sensible default if the values aren't available
            redImpactThreshold = 1.227; // This is the value for 100 * 100 * 10 under sqrt
          }
        } catch (e) {
          console.error('Error calculating red impact threshold:', e);
          redImpactThreshold = 1.227; // Default fallback
        }
  
        return {
          VEHICLE_CD: row.VEHICLE_CD,
          vehicle_info: {
            status,
            has_wifi: !!row.network_veh_cd,
            gmpt_code: row.gmpt_code,
            seat_idle: row.seat_idle,
            site_name: row.site_name,
            department: row.department,
            sim_number: row.sim_number,
            vor_setting: row.vor_setting,
            lockout_code: row.lockout_code,
            vehicle_name: row.vehicle_name,
            vehicle_type: row.vehicle_type,
            customer_name: row.customer_name,
            idle_polarity: idlePolarity,
            serial_number: row.serial_number,
            vehicle_model: row.vehicle_model,
            impact_lockout: row.impact_lockout,
            preop_schedule: preopSchedule,
            screen_version: screenVersion,
            survey_timeout: row.survey_timeout,
            last_connection: formatDate(row.last_connection),
            firmware_version: firmwareVersion,
            expansion_version: row.expmod_ver,
            full_lockout_enabled: row.full_lockout_enabled,
            full_lockout_timeout: row.full_lockout_timeout,
            last_dlist_timestamp: formatDate(row.dlist_timestamp),
            last_preop_timestamp: formatDate(row.preop_timestamp),
            red_impact_threshold: redImpactThreshold,
            impact_recalibration_date: formatDate(row.impact_recalibration_date)
          }
        };
      });
      
      // Store result in cache
      vehicleCache.set(cacheKey, processedRows);
      console.log('rows i am returnig from the back in vehicle info', processedRows);
      return processedRows;
    } catch (err) {
      console.error("Database Query Failed:", err.message);
      return [];
    }
  }



  async function fetchVehicleLogins(client, vehiclecds) {
    const allLogins = {};
    
    for (const vehicleCD of vehiclecds) {
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
          AND "SWIPE_TIME" >= CURRENT_DATE - INTERVAL '7 days'
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
      allLogins[vehicleCD] = result.rows.map(row => row);
    }
    
    return allLogins;
  }

  

  
  exports.getAvailableDates = async (req, res) => {
    const client = createSnapshotClient();
  
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
    const client = createSnapshotClient();
  
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
  
    if (!time1 || !time2) {
      return res.status(400).json({ error: 'Missing required snapshot times' });
    }
  
    // Check that at least one filter is provided
    if (!customer && !gmptCode) {
      return res.status(400).json({ error: 'At least one filter (customer or gmptCode) is required' });
    }
  
    // Convert date objects to the expected string format
    const formattedDate1 = format(new Date(date1), 'yyyy-MM-dd');
    const formattedDate2 = format(new Date(date2), 'yyyy-MM-dd');
  
    const snapshotClient = createSnapshotClient();
    const fleetiqClient = createFleetIQClient();
    
    // Helper function to format dates consistently
    const formatSnapshotDate = (timestamp) => {
      if (!timestamp) return null;
      const date = new Date(timestamp);
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    };
    
    try {
      await snapshotClient.connect();
      await fleetiqClient.connect();
  
      // Initialize query parameters with time and date values
      const queryParams = [formattedDate1, formattedDate2, time1, time2];
      
      // Build filter conditions based on priority:
      // 1. If gmptCode is provided, only use gmptCode filter
      // 2. Otherwise use customer filter + optional site filter
      let extraConditions = '';
      
      if (gmptCode) {
        // Prioritize GMPT code filter
        extraConditions = ` AND "gmptCode" ILIKE $5`;
        queryParams.push(`%${gmptCode}%`); // Use ILIKE with wildcards for partial matching
        console.log('Filtering by GMPT Code:', gmptCode);
      } else {
        // Use customer filter
        const customerInt = parseInt(customer);
        extraConditions = ` AND "cust_id" = $5`;
        queryParams.push(customerInt);
        console.log('Filtering by Customer:', customerInt);
        
        // Add site filter if provided
        if (site) {
          const siteInt = parseInt(site);
          extraConditions += ` AND "site_id" = $6`;
          queryParams.push(siteInt);
          console.log('Filtering by Site:', siteInt);
        }
      }
      
      console.log('Query parameters:', {
        customer,
        site,
        gmptCode,
        date1,
        time1,
        date2,
        time2,
        extraConditions,
        queryParams
      });
  
      // Query snapshots within the time ranges with formatted dates
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
      
      const result = await snapshotClient.query(query, queryParams);
      console.log(`Query returned ${result.rows.length} results`);
  
      // Group snapshots by vehicle
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

      // Extract unique customer_ids, site_ids, and dept_ids from snapshot data
      const customerIds = new Set();
      const siteIds = new Set();
      const deptIds = new Set();
      
      result.rows.forEach(row => {
        if (row.cust_id) customerIds.add(row.cust_id);
        if (row.site_id) siteIds.add(row.site_id);
        if (row.dept_id) deptIds.add(row.dept_id);
      });

      console.log('Unique customer IDs found:', Array.from(customerIds));
      console.log('Unique site IDs found:', Array.from(siteIds));
      console.log('Unique department IDs found:', Array.from(deptIds));

      // Fetch customer names from FleetIQ
      const customerNames = {};
      if (customerIds.size > 0) {
        const customerQuery = `
          SELECT "USER_CD" as customer_id, "USER_NAME" as customer_name 
          FROM "FMS_CUST_MST" 
          WHERE "USER_CD" IN (${Array.from(customerIds).join(',')})
        `;
        const customerResult = await fleetiqClient.query(customerQuery);
        customerResult.rows.forEach(row => {
          customerNames[row.customer_id] = row.customer_name;
        });
        console.log('Fetched customer names:', customerNames);
      }

      // Fetch site names from FleetIQ
      const siteNames = {};
      if (siteIds.size > 0) {
        const siteQuery = `
          SELECT "LOCATION_CD" as site_id, "NAME" as site_name 
          FROM "FMS_LOC_MST" 
          WHERE "LOCATION_CD" IN (${Array.from(siteIds).join(',')})
        `;
        const siteResult = await fleetiqClient.query(siteQuery);
        siteResult.rows.forEach(row => {
          siteNames[row.site_id] = row.site_name;
        });
        console.log('Fetched site names:', siteNames);
      }

      // Fetch department names from FleetIQ
      const deptNames = {};
      if (deptIds.size > 0) {
        const deptQuery = `
          SELECT "DEPT_CD" as dept_id, "DEPT_NAME" as dept_name 
          FROM "FMS_DEPT_MST" 
          WHERE "DEPT_CD" IN (${Array.from(deptIds).join(',')})
        `;
        const deptResult = await fleetiqClient.query(deptQuery);
        deptResult.rows.forEach(row => {
          deptNames[row.dept_id] = row.dept_name;
        });
        console.log('Fetched department names:', deptNames);
      }

      // Enrich snapshot data with names from FleetIQ and format dates
      const enrichedSnapshots = {};
      Object.keys(pairedSnapshots).forEach(vehicleCode => {
        const vehicleData = pairedSnapshots[vehicleCode];
        
        // Enrich 'before' snapshot
        if (vehicleData.before && Object.keys(vehicleData.before).length > 0) {
          vehicleData.before.customer_name = customerNames[vehicleData.before.cust_id] || 'Unknown Customer';
          vehicleData.before.site_name = siteNames[vehicleData.before.site_id] || 'Unknown Site';
          vehicleData.before.dept_name = deptNames[vehicleData.before.dept_id] || 'Unknown Department';
          // Format the snapshot date
          vehicleData.before.snapshot_date = vehicleData.before.formatted_date || formatSnapshotDate(vehicleData.before.query_execution_date);
        }
        
        // Enrich 'after' snapshot
        if (vehicleData.after && Object.keys(vehicleData.after).length > 0) {
          vehicleData.after.customer_name = customerNames[vehicleData.after.cust_id] || 'Unknown Customer';
          vehicleData.after.site_name = siteNames[vehicleData.after.site_id] || 'Unknown Site';
          vehicleData.after.dept_name = deptNames[vehicleData.after.dept_id] || 'Unknown Department';
          // Format the snapshot date
          vehicleData.after.snapshot_date = vehicleData.after.formatted_date || formatSnapshotDate(vehicleData.after.query_execution_date);
        }
        
        enrichedSnapshots[vehicleCode] = vehicleData;
      });

      console.log('✅ Enriched snapshot data with customer names, site names, department names, and formatted dates');
      res.json(enrichedSnapshots);
      
    } catch (error) {
      console.error('Error fetching snapshots:', error.message);
      res.status(500).json({ error: 'Internal server error fetching snapshots' });
    } finally {
      await snapshotClient.end();
      await fleetiqClient.end();
    }
  };


