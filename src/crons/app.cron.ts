import cron from "node-cron";
import {
  sendInvoiceUpdate,
  updateVenueWeather,
} from "src/services/admin/background-service";
import { getCurrentISTTime } from "../utils";
import { venueModel } from "src/models/venue/venue-schema";

// Runs every 2 hours (120 minutes)
export const startWeatherCron = () => {
  const currentTime = getCurrentISTTime();
  console.log(
    `🌦️ Weather update cron job scheduled to run every 2 hours (Current IST time: ${currentTime.toISOString()})`
  );

  // Initial update when server starts
  setTimeout(() => {
    console.log(
      `🌦️ Running initial weather update at ${getCurrentISTTime().toISOString()} IST...`
    );
    updateVenueWeather().catch((err) =>
      console.error("❌ Initial weather update failed:", err)
    );
  }, 10000); // Wait 10 seconds after server start

  // Schedule regular updates
  cron.schedule("0 */2 * * *", () => {
    console.log(
      `🌦️ Running scheduled weather update at ${getCurrentISTTime().toISOString()} IST...`
    );
    updateVenueWeather().catch((err) =>
      console.error("❌ Scheduled weather update failed:", err)
    );
  });
};

export const startInvoiceCron = () => {
  // Every hour at :40, from 01:40 to 16:40 UTC (07:10–22:10 IST)
  cron.schedule(
    "40 1-16 * * *",
    () => {
      console.log(
        `🧾 Running scheduled invoice update at ${getCurrentISTTime().toISOString()} IST...`
      );
      sendInvoiceUpdate().catch((err) =>
        console.error("❌ Scheduled invoice update failed:", err)
      );
    },
    {
      timezone: "UTC",
    }
  );
};

export const venueRainCron = async () => {
  cron.schedule("*/25 * * * *", async () => {
    try {
      console.warn("⚠️ Running venue rain update...");
      const now = new Date();

      const result = await venueModel.updateMany(
        {
          rain: true,
          hour: { $lte: now }, // assuming "hours" is a Date field
        },
        { $set: { rain: false, hour: null } }
      );

      console.log(
        `✅ Ran at ${now.toISOString()} | Updated: ${result.modifiedCount}`
      );
    } catch (err) {
      console.error("❌ Cron error:", err);
    }
  });
};
