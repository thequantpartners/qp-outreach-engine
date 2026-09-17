import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function testPort(port: number, secure: boolean) {
  const user = process.env.ZOHO_MAIL_USER!;
  const pass = process.env.ZOHO_MAIL_PASS!;
  const host = 'smtp.zoho.com';

  console.log(`Testing smtp.zoho.com on port ${port} (secure: ${secure})...`);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000
  });

  try {
    await transporter.verify();
    console.log(`✅ Port ${port} verified successfully!`);
    return true;
  } catch (err: any) {
    console.log(`❌ Port ${port} failed:`, err.message);
    return false;
  }
}

async function main() {
  await testPort(465, true);
  await testPort(587, false);
}

main();
