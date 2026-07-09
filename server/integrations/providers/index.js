const AtosProvider = require("./atos");
const DomsProvider = require("./doms");
const VeederRootProvider = require("./veederroot");
const GenericProvider = require("./generic");

const providers = {
  atos: AtosProvider,
  doms: DomsProvider,
  veederroot: VeederRootProvider,
  generic: GenericProvider,
};

const createProvider = (vendor, config = {}) => {
  const Provider = providers[String(vendor || "").toLowerCase()];

  if (!Provider) {
    return new GenericProvider(config);
  }

  return new Provider(config);
};

module.exports = {
  createProvider,
  providers: Object.keys(providers),
};
