import { sendPushToUser } from "../lib/fcm.js";
import { getBoss } from "../lib/pgboss.js";

type AbsentFollowUpJob = {
  tenantId: string;
  parentUserId: string;
  childName?: string;
};

export async function registerAbsentNotificationWorker() {
  const boss = getBoss();

  await boss.work<AbsentFollowUpJob>("absent-follow-up", async ([job]) => {
    await sendPushToUser(job.data.tenantId, job.data.parentUserId, {
      title: "Absence follow-up",
      body: `${job.data.childName ?? "Your child"} was absent today. Call teacher.`,
      type: "absence",
    });
  });
}
