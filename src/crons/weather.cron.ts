import cron from "node-cron";
import { updateVenueWeather } from "src/services/admin/background-service";

// Runs every 30 minutes
export const startWeatherCron = () => {
  // Runs every 30 minutes
  cron.schedule("*/120 * * * *", () => {
    console.log("🌦️ Running weather update cron job...");
    updateVenueWeather();
  });
};

