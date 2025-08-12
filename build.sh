# Use official Python base image or Ubuntu (change as per your app)
FROM ubuntu:22.04

# Install ffmpeg and other dependencies
RUN apt-get update && apt-get install -y ffmpeg

# Set working directory
WORKDIR /app

# Copy your website files into the container
COPY . .

# Expose your app port (change if needed)
EXPOSE 8080

# Set default command to run your app (change to your start command)
CMD ["./start.sh"]
