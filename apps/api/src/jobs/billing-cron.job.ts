import { processMonthlyStudentBilling } from "../services/payments.js";
import { getBoss } from "../lib/pgboss.js";

export async function registerBillingCronWorker() {
  const boss = getBoss();

  await boss.work("subscription-student-invoice", async () => {
    console.log("⏰ [BILLING CRON] Running monthly student counting and usage-based credit billing...");
    const result = await processMonthlyStudentBilling();
    console.log(`⏰ [BILLING CRON] Completed monthly billing for ${result.processedTenants} schools. Total credits deducted: ${result.totalCreditsDeducted}`);
  });

  // Run on the 1st of every month at midnight (0 0 1 * *)
  await boss.schedule("subscription-student-invoice", "0 0 1 * *", {});
}
