import dotenv from 'dotenv';
import { OutreachRepo } from '../src/db/repo.js';

dotenv.config();

async function setManualMode() {
  await OutreachRepo.init();
  await OutreachRepo.updateSettings({
    isAutonomousActive: false,
    startHour: 9,
    endHour: 19
  });
  console.log('✅ Modo Manual y QPartner Co-Pilot configurado en la base de datos (isAutonomousActive: false).');
  process.exit(0);
}

setManualMode().catch(err => {
  console.error(err);
  process.exit(1);
});
