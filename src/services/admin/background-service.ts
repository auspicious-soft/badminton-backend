import { venueModel } from "src/models/venue/venue-schema";
import dotenv from "dotenv";
dotenv.config();

export const updateVenueWeather = async () => {
  try {
    const venues = await venueModel.find({
      "location.coordinates": { $exists: true, $ne: [0, 0] },
    });

    for (const venue of venues) {
      if (!venue.location) continue;
      const [lng, lat] = venue.location.coordinates;
      const res = await fetch(
        `http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${lat},${lng}`
      );

      const weatherData = await res.json();

      if (weatherData?.current) {
        venue.weather = {
          status: weatherData.current.condition.text,
          icon: weatherData.current.condition.icon,
          lastUpdated: new Date(weatherData.current.last_updated),
          temperature: weatherData.current.temp_c,
        };

        await venue.save();
      }
    }
    console.log("✅ Venue weather updated.");
  } catch (error) {
    console.error("❌ Error updating venue weather:", error);
  }
};
