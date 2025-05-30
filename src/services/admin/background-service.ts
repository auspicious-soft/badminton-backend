import { venueModel } from "src/models/venue/venue-schema";
import dotenv from "dotenv";
import { getCurrentISTTime } from "../../utils";
dotenv.config();

export const updateVenueWeather = async () => {
  try {
    if (!process.env.WEATHER_API_KEY) {
      console.error("❌ Weather API key is not configured");
      return;
    }

    const venues = await venueModel.find({
      "location.coordinates": { $exists: true, $ne: [0, 0] },
    });

    const currentTime = getCurrentISTTime();
    console.log(`🌦️ Updating weather for ${venues.length} venues at ${currentTime.toISOString()} IST`);
    
    // Process venues in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < venues.length; i += batchSize) {
      const batch = venues.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (venue) => {
          try {
            if (!venue.location?.coordinates) return;
            
            const [lng, lat] = venue.location.coordinates;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const response = await fetch(
              `http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${lat},${lng}`,
              { signal: controller.signal }
            );
            
            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(`Weather API responded with status: ${response.status}`);
            }

            const weatherData = await response.json();

            if (weatherData?.current?.condition) {
              venue.weather = {
                status: weatherData.current.condition.text,
                icon: weatherData.current.condition.icon,
                lastUpdated: getCurrentISTTime(), // Use IST time for lastUpdated
                temperature: weatherData.current.temp_c,
              };

              await venue.save();
            } else {
              console.warn(`⚠️ Invalid weather data for venue ${venue._id}`);
            }
          } catch (venueError) {
            console.error(`❌ Error updating weather for venue ${venue._id}:`, venueError);
            // Continue with other venues
          }
        })
      );
      
      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < venues.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log("✅ Venue weather update completed.");
  } catch (error) {
    console.error("❌ Error in weather update service:", error);
  }
};
