// calculateTotal(cart, code) -> { subtotal, discount, shipping, tax, total }
// cart: [{ price, qty }]
export function calculateTotal(cart, code) {
  var subtotal = 0;
  for (var i = 0; i < cart.length; i++) {
    var line = cart[i];
    var lt = line.price * line.qty;
    lt = Math.round(lt * 100) / 100;
    subtotal = subtotal + lt;
  }
  var discount = 0;
  if (code == 'SAVE10') {
    discount = subtotal * 0.1;
  } else if (code == 'SAVE20') {
    if (subtotal > 100) {
      discount = subtotal * 0.2;
    } else {
      discount = subtotal * 0.1;
    }
  } else if (code && code.indexOf('FLAT') == 0) {
    discount = parseInt(code.slice(4)) || 0;
    if (discount > subtotal) discount = subtotal;
  }
  discount = Math.round(discount * 100) / 100;
  var shipping = 0;
  if (subtotal >= 50) {
    shipping = 0;
  } else {
    shipping = 5.99;
  }
  if (cart.length == 0) shipping = 0;
  var taxable = subtotal - discount;
  var tax = Math.floor(taxable * 0.0825 * 100) / 100;
  var total = taxable + shipping + tax;
  total = Math.round(total * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: discount,
    shipping: shipping,
    tax: tax,
    total: total,
  };
}
