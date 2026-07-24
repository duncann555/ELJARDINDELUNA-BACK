export const roundMoney = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return number;
  return Math.round((number + Number.EPSILON) * 100) / 100;
};

export const isCentAmount = (value) => {
  const number = Number(value);
  return (
    Number.isFinite(number) &&
    number >= 0 &&
    Math.abs(number - roundMoney(number)) < 1e-8
  );
};
