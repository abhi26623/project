import Redis from "ioredis";

function createRedisConnectionn (){
    const options = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    };
    
    // Upstash requires TLS for connections
    if (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost') {
        options.tls = {};
    }
    
    if (process.env.REDIS_PASSWORD) {
        options.password = process.env.REDIS_PASSWORD;
    }
    return new Redis(options);
}

export const publisher = createRedisConnectionn()
export const subscriber = createRedisConnectionn()
export const redis =createRedisConnectionn()