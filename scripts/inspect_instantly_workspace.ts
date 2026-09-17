async function main() {
  const token = 'MWJkZDZiNGUtNDg2NS00ZWM0LTk2YTYtMzA4OWZlMDJhZDE2OldmQm9Hc2pxY2FrZg==';
  
  console.log('--- Verificando cuentas de correo (mailboxes) conectadas en Instantly ---');
  const resAccounts = await fetch('https://api.instantly.ai/api/v2/accounts?limit=10', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  console.log('Accounts HTTP:', resAccounts.status);
  const accountsData = await resAccounts.json();
  console.log('Accounts Data:', JSON.stringify(accountsData, null, 2));

  console.log('\n--- Verificando campañas existentes en Instantly ---');
  const resCampaigns = await fetch('https://api.instantly.ai/api/v2/campaigns?limit=10', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  console.log('Campaigns HTTP:', resCampaigns.status);
  const campaignsData = await resCampaigns.json();
  console.log('Campaigns Data:', JSON.stringify(campaignsData, null, 2));
}

main().catch(console.error);
