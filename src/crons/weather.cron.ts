import cron from "node-cron";
import {
  sendInvoiceUpdate,
  updateVenueWeather,
} from "src/services/admin/background-service";
import { getCurrentISTTime } from "../utils";

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
  //every 24 hours
  cron.schedule(
    "50 6-22 * * *", // Run every hour at HH:50 UTC, from 06:50 to 22:50 UTC
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
