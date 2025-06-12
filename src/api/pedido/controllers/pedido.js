'use strict';

// Importar y configurar Stripe con la clave secreta desde variables de entorno
const stripe = require("stripe")(process.env.STRIPE_KEY);

// Importar la función para crear controladores de Strapi
const { createCoreController } = require('@strapi/strapi').factories;

// Exportar el controlador personalizado para la entidad 'pedido'
module.exports = createCoreController('api::pedido.pedido', ({ strapi }) => ({
  
  /**
   * Método personalizado para crear un pedido y procesar el pago con Stripe
   * @param {Object} ctx - Contexto de la petición HTTP
   */
  async create(ctx) {
    // Extraer los productos del cuerpo de la petición
    const { productos } = ctx.request.body;

    try {
      // Crear los line items para Stripe Checkout
      // Promise.all ejecuta todas las promesas en paralelo para mejor rendimiento
      const lineItems = await Promise.all(
        productos.map(async (producto) => {
          // Buscar la información completa del producto en la base de datos
          const item = await strapi.entityService.findOne('api::producto.producto', producto.id);

          // Retornar el formato requerido por Stripe Checkout
          return {
            price_data: {
              currency: "eur",                              // Moneda en euros
              product_data: {
                name: item.nombreProducto,                 // Nombre del producto
              },
              unit_amount: Math.round(item.precioProducto * 100), // Precio en céntimos 
            },
            quantity: 1,                                   // Cantidad fija de 1 por producto
          };
        })
      );

      // Crear la sesión de checkout en Stripe
      const session = await stripe.checkout.sessions.create({
        // Configuración de dirección de envío
        shipping_address_collection: {
          allowed_countries: ["ES"],                       // Solo permitir envíos a España
        },
        payment_method_types: ["card"],                    // Solo aceptar pagos con tarjeta
        mode: "payment",                                   // Modo de pago único 
        line_items: lineItems,                             // Productos a pagar
        success_url: process.env.CLIENT_URL + "/pago-correcto", // URL de éxito
        cancel_url: process.env.CLIENT_URL + "/pago-fallido",   // URL de cancelación
      });

      // Crear el pedido en la base de datos de Strapi con el ID de la sesión de Stripe
      await strapi.service('api::pedido.pedido').create({
        data: { 
          productos,                                       // Productos del pedido
          stripeId: session.id                             // ID de la sesión de Stripe para seguimiento
        }
      });

      // Retornar la sesión de Stripe al frontend
      return { stripeSession: session };

    } catch (error) {
      // Manejo de errores
      console.error("Error al crear sesión de Stripe:", error);
      ctx.response.status = 500;                           // Código de error HTTP 500
      return { error: error.message };                     // Retornar el mensaje de error
    }
  }
}));