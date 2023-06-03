export class ServiceNotAvailable extends Error {
  constructor(serviceName: string) {
    super(`use${serviceName}Service must be used within ${serviceName}ServiceProvider`);
  }
}
