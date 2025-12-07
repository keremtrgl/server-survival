const TRAFFIC_TYPES = {
    STATIC: 'STATIC',
    READ: 'READ',
    WRITE: 'WRITE',
    UPLOAD: 'UPLOAD',
    SEARCH: 'SEARCH',
    MALICIOUS: 'MALICIOUS'
};

const CONFIG = {
    gridSize: 30,
    tileSize: 4,
    colors: {
        bg: 0x050505, grid: 0x1a1a1a,
        alb: 0x3b82f6, compute: 0xf97316,
        db: 0xdc2626, waf: 0xa855f7,
        s3: 0x10b981, line: 0x475569,
        lineActive: 0x38bdf8,
        requestFail: 0xef4444,
        cache: 0xDC382D, // Redis red
        sqs: 0xFF9900  // AWS orange
    },
    trafficTypes: {
        STATIC: {
            name: 'STATIC',
            method: 'GET',
            color: 0x4ade80,
            reward: 0.80,
            score: 3,
            cacheable: true,
            cacheHitRate: 0.90,
            destination: 's3',
            processingWeight: 0.5
        },
        READ: {
            name: 'READ',
            method: 'GET',
            color: 0x3b82f6,
            reward: 1.20,
            score: 5,
            cacheable: true,
            cacheHitRate: 0.40,
            destination: 'db',
            processingWeight: 1.0
        },
        WRITE: {
            name: 'WRITE',
            method: 'POST/PUT',
            color: 0xf97316,
            reward: 1.80,
            score: 8,
            cacheable: false,
            cacheHitRate: 0,
            destination: 'db',
            processingWeight: 1.5
        },
        UPLOAD: {
            name: 'UPLOAD',
            method: 'POST+file',
            color: 0xfbbf24,
            reward: 2.00,
            score: 10,
            cacheable: false,
            cacheHitRate: 0,
            destination: 's3',
            processingWeight: 2.0
        },
        SEARCH: {
            name: 'SEARCH',
            method: 'GET+query',
            color: 0x06b6d4,
            reward: 1.20,
            score: 5,
            cacheable: true,
            cacheHitRate: 0.15,
            destination: 'db',
            processingWeight: 2.5
        },
        MALICIOUS: {
            name: 'MALICIOUS',
            method: 'any',
            color: 0xef4444,
            reward: 0,
            score: 0,
            cacheable: false,
            cacheHitRate: 0,
            destination: 'blocked',
            processingWeight: 1.0
        }
    },
    internetNodeStartPos: { x: -40, y: 0, z: 0 },
    services: {
        waf: {
            name: "Firewall", cost: 40, type: 'waf', processingTime: 20, capacity: 100, upkeep: 4,
            tooltip: { upkeep: "Low", desc: "<b>Firewall.</b> The first line of defense. Blocks Malicious traffic." }
        },
        alb: {
            name: "Load Balancer", cost: 50, type: 'alb', processingTime: 50, capacity: 50, upkeep: 6,
            tooltip: { upkeep: "Medium", desc: "<b>Load Balancer.</b> Distributes traffic to multiple Compute instances." }
        },
        compute: {
            name: "Compute", cost: 60, type: 'compute', processingTime: 600, capacity: 4, upkeep: 12,
            tooltip: { upkeep: "High", desc: "<b>Compute Node.</b> Processes requests. <b>Upgradeable (Tiers 1-3).</b>" },
            tiers: [
                { level: 1, capacity: 4, cost: 0 },
                { level: 2, capacity: 10, cost: 100 },
                { level: 3, capacity: 18, cost: 160 }
            ]
        },
        db: {
            name: "Relational DB", cost: 150, type: 'db', processingTime: 300, capacity: 8, upkeep: 24,
            tooltip: { upkeep: "Very High", desc: "<b>SQL Database.</b> Destination for READ/WRITE/SEARCH traffic. <b>Upgradeable (Tiers 1-3).</b>" },
            tiers: [
                { level: 1, capacity: 8, cost: 0 },
                { level: 2, capacity: 20, cost: 200 },
                { level: 3, capacity: 35, cost: 350 }
            ]
        },
        s3: {
            name: "File Storage", cost: 25, type: 's3', processingTime: 200, capacity: 100, upkeep: 5,
            tooltip: { upkeep: "Low", desc: "<b>Storage.</b> Destination for STATIC/UPLOAD traffic." }
        },
        cache: {
            name: "Memory Cache",
            cost: 60,
            type: 'cache',
            processingTime: 50,
            capacity: 30,
            upkeep: 8,
            tooltip: { upkeep: "Medium", desc: "<b>Memory Cache.</b> Caches responses to reduce DB load." },
            cacheHitRate: 0.35,
            tiers: [
                { level: 1, capacity: 30, cacheHitRate: 0.35, cost: 0 },
                { level: 2, capacity: 50, cacheHitRate: 0.50, cost: 120 },
                { level: 3, capacity: 80, cacheHitRate: 0.65, cost: 180 }
            ]
        },
        sqs: {
            name: "Message Queue",
            cost: 35,
            type: 'sqs',
            processingTime: 100,
            capacity: 10,
            maxQueueSize: 200,
            upkeep: 2,
            tooltip: { upkeep: "Low", desc: "<b>Queue.</b> Buffers requests during spikes. Prevents drops." }
        }
    },
    survival: {
        startBudget: 340,
        baseRPS: 0.6,
        rampUp: 0.018,
        maxRPS: Infinity,
        trafficDistribution: {
            [TRAFFIC_TYPES.STATIC]: 0.30,
            [TRAFFIC_TYPES.READ]: 0.20,
            [TRAFFIC_TYPES.WRITE]: 0.15,
            [TRAFFIC_TYPES.UPLOAD]: 0.05,
            [TRAFFIC_TYPES.SEARCH]: 0.10,
            [TRAFFIC_TYPES.MALICIOUS]: 0.20
        },

        SCORE_POINTS: {
            FAIL_REPUTATION: -2,
            MALICIOUS_PASSED_REPUTATION: -8,
            MALICIOUS_BLOCKED_SCORE: 10,
            CACHE_HIT_BONUS: 0.20
        },

        upkeepScaling: {
            enabled: true,
            baseMultiplier: 1.0,
            maxMultiplier: 2.0,
            scaleTime: 600
        },

        maliciousSpike: {
            enabled: true,
            interval: 90,
            duration: 15,
            maliciousPercent: 0.40,
            warningTime: 5
        }
    },
    sandbox: {
        defaultBudget: 2000,
        defaultRPS: 1.0,
        defaultBurstCount: 10,
        upkeepEnabled: false,
        trafficDistribution: {
            STATIC: 30,
            READ: 20,
            WRITE: 15,
            UPLOAD: 5,
            SEARCH: 10,
            MALICIOUS: 20
        }
    }
};
