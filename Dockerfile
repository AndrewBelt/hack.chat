FROM alpine:latest


RUN apk update && apk add git make nodejs nodejs-npm 
COPY hack.chat /hack.chat
RUN cd hack.chat && \
    npm install && \
    cd client && \
    npm install -g less jade http-server && \
    make && \
    apk del git make nodejs-npm && \
    rm -rf /var/cache/apk/* 

WORKDIR /hack.chat/
EXPOSE 8080 6060
