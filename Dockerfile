# Single-container test deployment: Apache + PHP + MariaDB. Data is EPHEMERAL.
FROM php:8.2-apache-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends mariadb-server mariadb-client \
 && rm -rf /var/lib/apt/lists/* \
 && docker-php-ext-install -j"$(nproc)" mysqli pdo_mysql \
 && a2enmod headers setenvif

COPY docker/lnu.conf /etc/apache2/conf-available/lnu.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-lnu.ini
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# Listen on ${APACHE_PORT} (set from Render's $PORT by the entrypoint).
RUN a2enconf lnu \
 && sed -i 's/Listen 80$/Listen ${APACHE_PORT}/' /etc/apache2/ports.conf \
 && sed -i 's/<VirtualHost \*:80>/<VirtualHost *:${APACHE_PORT}>/' /etc/apache2/sites-available/000-default.conf \
 && sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
 && chmod 755 /usr/local/bin/entrypoint.sh

ENV APACHE_PORT=10000

COPY . /var/www/html/

# Writable runtime dirs only; the code stays root-owned.
RUN rm -rf /var/www/html/docker \
 && mkdir -p /var/www/html/logs \
             /var/www/html/dormer/payment_receipt/uploads/payment_proofs \
             /var/www/html/registration/uploads/entrance_slips \
 && chown -R www-data:www-data /var/www/html/logs \
             /var/www/html/dormer/payment_receipt/uploads \
             /var/www/html/registration/uploads

EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
