import { productRowsFromForm, toAmount } from "../utils/dsrData";

const nowLabel = () =>
  new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const currentVolumeForProduct = (product) => {
  if (product.tankDip !== "" && product.tankDip !== undefined) {
    return toAmount(product.tankDip);
  }

  if (product.closingStock !== "" && product.closingStock !== undefined) {
    return toAmount(product.closingStock);
  }

  return Math.max(
    toAmount(product.opening) + toAmount(product.receipt) - toAmount(product.sales),
    0
  );
};

export const tankCapacityFromForm = (
  form,
  { lastUpdated = nowLabel(), productConfig } = {}
) =>
  productRowsFromForm(form, undefined, productConfig).map((product) => {
    const capacity = toAmount(product.tankCapacity);
    const currentVolume = currentVolumeForProduct(product);
    const percentageFilled =
      capacity > 0 ? Math.min((currentVolume / capacity) * 100, 100) : 0;

    return {
      tankId: product.prefix,
      tankName: product.tankName,
      fuelType: product.fuelType || product.label,
      capacity,
      currentVolume,
      percentageFilled,
      lastUpdated,
    };
  });

export const tankCapacityProvider = {
  fromForm: tankCapacityFromForm,
};
