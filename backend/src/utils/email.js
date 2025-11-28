const nodemailer = require('nodemailer');
const logger = require('./logger');

// Twilio for SMS (optional)
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
} catch (error) {
  logger.warn('Twilio not configured or unavailable');
}

// Create email transporter
const createTransporter = () => {
  const config = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  };

  return nodemailer.createTransport(config);
};

// Send email
exports.sendEmail = async ({ to, subject, text, html }) => {
  try {
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      logger.warn('Email not configured, skipping email send');
      return {
        success: false,
        message: 'Email service not configured'
      };
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || `EFFAK <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html: html || text
    };

    const info = await transporter.sendMail(mailOptions);

    logger.info('Email sent successfully', {
      to,
      subject,
      messageId: info.messageId
    });

    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error) {
    logger.error('Email send error:', {
      error: error.message,
      to,
      subject
    });

    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Send bulk emails
exports.sendBulkEmails = async (emails) => {
  const results = [];

  for (const email of emails) {
    try {
      const result = await exports.sendEmail(email);
      results.push({
        to: email.to,
        success: true,
        messageId: result.messageId
      });
    } catch (error) {
      results.push({
        to: email.to,
        success: false,
        error: error.message
      });
    }
  }

  return results;
};

// Send SMS via Twilio
exports.sendSMS = async ({ to, message }) => {
  try {
    if (!twilioClient) {
      logger.warn('Twilio not configured, skipping SMS send');
      return {
        success: false,
        message: 'SMS service not configured'
      };
    }

    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to
    });

    logger.info('SMS sent successfully', {
      to,
      sid: result.sid
    });

    return {
      success: true,
      sid: result.sid
    };

  } catch (error) {
    logger.error('SMS send error:', {
      error: error.message,
      to
    });

    throw new Error(`Failed to send SMS: ${error.message}`);
  }
};

// Send verification email
exports.sendVerificationEmail = async (to, firstName, token) => {
  const verificationUrl = `${process.env.API_URL}/api/auth/verify-email/${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background-color: #007bff;
          color: #ffffff;
          text-decoration: none;
          border-radius: 4px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Welcome to EFFAK!</h1>
        <p>Hello ${firstName},</p>
        <p>Thank you for registering with EFFAK (Emergency Financial First Aid Kit). Please verify your email address by clicking the button below:</p>
        <a href="${verificationUrl}" class="button">Verify Email Address</a>
        <p>Or copy and paste this link into your browser:</p>
        <p>${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <div class="footer">
          <p>If you did not create an account, please ignore this email.</p>
          <p>&copy; ${new Date().getFullYear()} EFFAK. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return exports.sendEmail({
    to,
    subject: 'Verify your EFFAK account',
    html
  });
};

// Send password reset email
exports.sendPasswordResetEmail = async (to, firstName, token) => {
  const resetUrl = `${process.env.API_URL}/api/auth/reset-password/${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background-color: #dc3545;
          color: #ffffff;
          text-decoration: none;
          border-radius: 4px;
          margin: 20px 0;
        }
        .warning {
          background-color: #fff3cd;
          border: 1px solid #ffc107;
          padding: 12px;
          border-radius: 4px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Password Reset Request</h1>
        <p>Hello ${firstName},</p>
        <p>We received a request to reset your password. Click the button below to proceed:</p>
        <a href="${resetUrl}" class="button">Reset Password</a>
        <p>Or copy and paste this link into your browser:</p>
        <p>${resetUrl}</p>
        <div class="warning">
          <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour for your security.
        </div>
        <div class="footer">
          <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
          <p>&copy; ${new Date().getFullYear()} EFFAK. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return exports.sendEmail({
    to,
    subject: 'Password Reset Request - EFFAK',
    html
  });
};

// Send emergency access email
exports.sendEmergencyAccessEmail = async (to, firstName, householdName, accessUrl, expiresInHours = 72) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background-color: #28a745;
          color: #ffffff;
          text-decoration: none;
          border-radius: 4px;
          margin: 20px 0;
        }
        .alert {
          background-color: #d1ecf1;
          border: 1px solid #0c5460;
          padding: 12px;
          border-radius: 4px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Emergency Document Access</h1>
        <p>Hello ${firstName},</p>
        <p>You have been granted emergency access to important documents for <strong>${householdName}</strong>.</p>
        <p>Click the button below to access the documents:</p>
        <a href="${accessUrl}" class="button">Access Emergency Documents</a>
        <p>Or copy and paste this link into your browser:</p>
        <p>${accessUrl}</p>
        <div class="alert">
          <strong>ℹ️ Important:</strong> This access link will expire in ${expiresInHours} hours for security purposes.
        </div>
        <div class="footer">
          <p>If you were not expecting this email, please contact the household administrator.</p>
          <p>&copy; ${new Date().getFullYear()} EFFAK. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return exports.sendEmail({
    to,
    subject: `Emergency Document Access - ${householdName}`,
    html
  });
};

// Verify email configuration
exports.verifyEmailConfig = async () => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return {
        configured: false,
        message: 'Email credentials not configured'
      };
    }

    const transporter = createTransporter();
    await transporter.verify();

    logger.info('Email configuration verified successfully');

    return {
      configured: true,
      message: 'Email service is configured and ready'
    };

  } catch (error) {
    logger.error('Email configuration verification failed:', error);

    return {
      configured: false,
      message: `Email configuration error: ${error.message}`
    };
  }
};

module.exports = exports;
