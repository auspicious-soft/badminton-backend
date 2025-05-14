import cron from "node-cron";
import { updateVenueWeather } from "src/services/admin/background-service";
import { getCurrentISTTime } from "../utils";

// Runs every 2 hours (120 minutes)
export const startWeatherCron = () => {
  const currentTime = getCurrentISTTime();
  console.log(`🌦️ Weather update cron job scheduled to run every 2 hours (Current IST time: ${currentTime.toISOString()})`);
  
  // Initial update when server starts
  setTimeout(() => {
    console.log(`🌦️ Running initial weather update at ${getCurrentISTTime().toISOString()} IST...`);
    updateVenueWeather().catch(err => 
      console.error("❌ Initial weather update failed:", err)
    );
  }, 10000); // Wait 10 seconds after server start
  
  // Schedule regular updates
  cron.schedule("0 */2 * * *", () => {
    console.log(`🌦️ Running scheduled weather update at ${getCurrentISTTime().toISOString()} IST...`);
    updateVenueWeather().catch(err => 
      console.error("❌ Scheduled weather update failed:", err)
    );
  });
};

