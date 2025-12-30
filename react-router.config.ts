// Todo : react-router.config.ts
import type { Config } from "@react-router/dev/dist/config";

const config: Config = {
    ssr: true,
    future: {
        unstable_viteEnvironmentApi: true,
    },
};

export default config;
