import cron from "node-cron";
import { updateVenueWeather } from "src/services/admin/background-service";

// Runs every 2 hours (120 minutes)
export const startWeatherCron = () => {
  console.log("🌦️ Weather update cron job scheduled to run every 2 hours");
  
  // Initial update when server starts
  setTimeout(() => {
    console.log("🌦️ Running initial weather update...");
    updateVenueWeather().catch(err => 
      console.error("❌ Initial weather update failed:", err)
    );
  }, 10000); // Wait 10 seconds after server start
  
  // Schedule regular updates
  cron.schedule("0 */2 * * *", () => {
    console.log("🌦️ Running scheduled weather update...");
    updateVenueWeather().catch(err => 
      console.error("❌ Scheduled weather update failed:", err)
    );
  });
};

