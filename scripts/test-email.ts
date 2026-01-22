import { config } from 'dotenv';
import { sendMagicLinkEmail } from '../src/lib/email';
import { randomBytes } from 'crypto';

// Load environment variables from .env file
config();

async function testEmail() {
  console.log('🔍 Testing Resend email integration...\n');

  // Check environment variables
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_...') {
    console.error('❌ Error: RESEND_API_KEY not configured in .env');
    console.error('   Get your API key from: https://resend.com/api-keys');
    console.error('   Then update .env with: RESEND_API_KEY="re_..."');
    process.exit(1);
  }

  // Get recipient email from command line or prompt
  const recipientEmail = process.argv[2];

  if (!recipientEmail) {
    console.error('❌ Error: No recipient email provided');
    console.error('   Usage: npx tsx scripts/test-email.ts your-email@example.com');
    process.exit(1);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    console.error('❌ Error: Invalid email format');
    process.exit(1);
  }

  console.log(`📧 Sending test magic link to: ${recipientEmail}`);
  console.log(`🔗 From: ${process.env.EMAIL_FROM || 'Gather <noreply@gather.app>'}`);
  console.log(`🌐 Base URL: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}\n`);

  try {
    // Generate a test token
    const testToken = randomBytes(32).toString('hex');
    console.log(`🔑 Test token: ${testToken.substring(0, 16)}...`);

    // Send the email
    await sendMagicLinkEmail(recipientEmail, testToken);

    console.log('\n✅ Email sent successfully!\n');
    console.log('Verification checklist:');
    console.log('  [ ] Email arrived within 30 seconds');
    console.log('  [ ] Subject line is "Sign in to Gather"');
    console.log(
      `  [ ] Link includes token parameter: /auth/verify?token=${testToken.substring(0, 16)}...`
    );
    console.log('  [ ] Link format is correct');
    console.log('  [ ] "Expires in 15 minutes" message is present');
    console.log('\n📬 Check your inbox (and spam folder) now!');
  } catch (error) {
    console.error('\n❌ Email send failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.error('\n💡 Tip: Check that your RESEND_API_KEY is correct');
        console.error('   Get a new key from: https://resend.com/api-keys');
      } else if (error.message.includes('domain')) {
        console.error('\n💡 Tip: Verify your sending domain in Resend dashboard');
        console.error('   Or use a verified "from" address');
      }
    }

    process.exit(1);
  }
}

testEmail().catch(console.error);
