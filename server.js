require('dotenv').config({ path: './host.env' });


const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// MySQL connection
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 10000, // 10 seconds
});


connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database:", err);
    return;
  }
  console.log("Connected to MySQL database");
});


// API route for registration
app.post("/register", (req, res) => {
  const { name, username, password, email, phoneNumber } = req.body;

  // Password validation
  const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long, start with a capital letter, and contain at least one number",
    });
  }

  // Check if email already exists
  const checkEmailSql = "SELECT * FROM users WHERE email = ?";
  connection.query(checkEmailSql, [email], (err, emailResults) => {
    if (err) {
      console.error("Error checking email in MySQL:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    if (emailResults.length > 0) {
      // Email already exists
      return res.status(400).json({ error: "Email is already registered" });
    }

    // Check if username already exists
    const checkUsernameSql = "SELECT * FROM users WHERE username = ?";
    connection.query(checkUsernameSql, [username], (err, usernameResults) => {
      if (err) {
        console.error("Error checking username in MySQL:", err);
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }

      if (usernameResults.length > 0) {
        // Username already exists
        return res.status(400).json({ error: "Username is already taken" });
      }

      // Check if phone number already exists
      const checkPhoneNumberSql = "SELECT * FROM users WHERE phoneNumber = ?";
      connection.query(checkPhoneNumberSql, [phoneNumber], (err, phoneResults) => {
        if (err) {
          console.error("Error checking phone number in MySQL:", err);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }

        if (phoneResults.length > 0) {
          // Phone number already exists
          return res.status(400).json({ error: "Phone number is already registered" });
        }

        // All checks passed, proceed with registration
        const sql =
          "INSERT INTO users (name, username, password, email, phoneNumber) VALUES (?, ?, ?, ?, ?)";
        const values = [name, username, password, email, phoneNumber];

        connection.query(sql, values, (err, result) => {
          if (err) {
            console.error("Error inserting data into MySQL:", err);
            res.status(500).json({ error: "Internal Server Error" });
            return;
          }
          console.log("User registered successfully");
          res.status(200).json({ message: "Registration successful" });
        });
      });
    });
  });
});

// API route for login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Check if the email exists in the database
  const checkEmailSql = "SELECT * FROM users WHERE email = ?";
  connection.query(checkEmailSql, [email], (err, results) => {
    if (err) {
      console.error("Error checking email in MySQL:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    if (results.length === 0) {
      // Email not found
      res.status(400).json({ error: "Email not found" });
      return;
    }

    // Email found, now check if the password matches
    const user = results[0];
    if (user.password !== password) {
      // Incorrect password
      res.status(400).json({ error: "Incorrect password" });
      return;
    }

    // Login successful
    res.status(200).json({ message: "Login successful" });
  });
});
// API route for adding a device
app.post("/add-device", (req, res) => {
  const { userEmail, name, mac_address } = req.body;

  // Check if the user exists
  const checkUserSql = "SELECT * FROM users WHERE email = ?";
  connection.query(checkUserSql, [userEmail], (err, userResults) => {
    if (err) {
      console.error("Error checking user in MySQL:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    if (userResults.length === 0) {
      // User not found
      res.status(404).json({ error: "User not found" });
      return;
    }

    // User found, proceed with adding device
    const userId = userResults[0].id;
    const sql = "INSERT INTO user_devices (user_id, device_name, mac_address) VALUES (?, ?, ?)";
    const values = [userId, name, mac_address];

    connection.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error inserting data into MySQL:", err);
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }
      console.log("Device added successfully");
      res.status(200).json({ message: "Device added successfully" });
    });
  });
});

// API route for fetching devices associated with a user
app.get("/get-devices", (req, res) => {
  const { userEmail } = req.query;

  const checkUserSql = "SELECT * FROM users WHERE email = ?";
  connection.query(checkUserSql, [userEmail], (err, userResults) => {
    if (err) {
      console.error("Error checking user in MySQL:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    if (userResults.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userId = userResults[0].id;
    const sql = `
      SELECT ud.id, ud.device_name, ud.mac_address,sd.timestamp, sd.temperature, sd.humidity, sd.fahrenheit, sd.co2, sd.eco2, sd.tvoc, sd.rawh2, sd.rawethanol, sd.dust
      FROM user_devices ud
      LEFT JOIN (
        SELECT mac_address, timestamp, temperature, humidity, fahrenheit, co2, eco2, tvoc, rawh2, rawethanol, dust
        FROM sensor_data
        WHERE (mac_address, timestamp) IN (
          SELECT mac_address, MAX(timestamp)
          FROM sensor_data
          GROUP BY mac_address
        )
      ) sd ON ud.mac_address = sd.mac_address
      WHERE ud.user_id = ?;
    `;
    
    connection.query(sql, [userId], (err, deviceResults) => {
      if (err) {
        console.error("Error fetching devices from MySQL:", err);
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }
      
      res.status(200).json(deviceResults);
    });
  });
});


// API route for checking device existence
app.get("/check-device", (req, res) => {
  const { mac_address } = req.query;
  const sql = 'SELECT COUNT(*) AS count FROM sensor_data WHERE mac_address = ?';
  
  connection.query(sql, [mac_address], (err, results) => {
    if (err) {
      console.error('Error checking device in MySQL:', err);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
    
    res.status(200).json({ exists: results[0].count > 0 });
  });
});

// API route for deleting a device
app.delete("/delete-device", (req, res) => {
  const { userEmail, mac_address } = req.body;

  // Check if the user exists
  const checkUserSql = "SELECT * FROM users WHERE email = ?";
  connection.query(checkUserSql, [userEmail], (err, userResults) => {
    if (err) {
      console.error("Error checking user in MySQL:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    if (userResults.length === 0) {
      // User not found
      res.status(404).json({ error: "User not found" });
      return;
    }

    // User found, proceed with deleting device
    const userId = userResults[0].id;
    const deleteDeviceSql = "DELETE FROM user_devices WHERE user_id = ? AND mac_address = ?";
    connection.query(deleteDeviceSql, [userId, mac_address], (err, result) => {
      if (err) {
        console.error("Error deleting device from MySQL:", err);
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }
      console.log("Device deleted successfully");
      res.status(200).json({ message: "Device deleted successfully" });
    });
  });
});

// getting profile
app.get("/profile-data", (req, res) => {
  const { email } = req.query; // Extract email from the query parameters

  const sql = `
    SELECT 
      name, 
      username, 
      email, 
      phoneNumber   
    FROM users
    WHERE email = ?;`;

  connection.query(sql, [email], (err, results) => {
    if (err) {
      console.error("Error fetching profile data from MySQL:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    
    if (results.length === 0) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    
    res.status(200).json(results[0]);
  });
});

// chaning password
// changing password
app.post("/changepassword", (req, res) => {
  const { username, password } = req.body;

  // Password validation
  const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long, start with a capital letter, and contain at least one number",
    });
  }

  // Update user's password in the database
  const sql = "UPDATE users SET password = ? WHERE username = ?";
  connection.query(sql, [password, username], (err, results) => {
    if (err) {
      console.error("Error updating password:", err);
      return res.status(500).json({
        error: "Internal server error",
      });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }
    res.status(200).json({
      message: "Password has been changed successfully",
    });
  });
});


// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
