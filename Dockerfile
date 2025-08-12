FROM ubuntu:22.04

RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app

COPY . .

EXPOSE 8080

CMD ["./start.sh"]  # Replace with your actual start command
