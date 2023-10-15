FROM nginx:alpine

RUN apk add --no-cache git

# Copy the nginx configuration file
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy cron file to the cron.d directory
COPY update-mirror.cron /etc/cron.d/update-mirror.cron
COPY update-mirror.sh /root/update-mirror.sh

# Expose port 80
EXPOSE 80/tcp

# Expose volume
VOLUME /mirror-cache

# Start nginx and cron service
CMD ["sh", "-c", "sh /root/update-mirror.sh && crond && nginx -g \"daemon off;\""]
