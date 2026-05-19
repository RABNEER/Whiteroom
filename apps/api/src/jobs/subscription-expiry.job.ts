import { downgradeExpiredSubscriptions } from "../services/payments.js";
import { getBoss } from "../lib/pgboss.js";

export async function registerSubscriptionExpiryWorker() {
  const boss = getBoss();

  await boss.work("subscription-expiry", async () => {
    await downgradeExpiredSubscriptions();
  });

  await boss.schedule("subscription-expiry", "0 0 * * *", {});
}
