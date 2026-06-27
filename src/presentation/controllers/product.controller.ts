import { FastifyRequest, FastifyReply } from 'fastify';
import { ProductService } from '../../application/products/ProductService';
import { createProductSchema, updateProductSchema, productQuerySchema } from '../schemas/product.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class ProductController {
  constructor(private service: ProductService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = productQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
    reply.send(await this.service.list(parsed.data));
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    reply.send(await this.service.getById(Number(id)));
  };

  getByBarcode = async (request: FastifyRequest, reply: FastifyReply) => {
    const { barcode } = request.params as { barcode: string };
    reply.send(await this.service.getByBarcode(barcode));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.status(201).send(await this.service.create(parsed.data));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateProductSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    reply.send(await this.service.update(Number(id), parsed.data));
  };

  softDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.softDelete(Number(id));
    reply.status(204).send();
  };

  uploadImage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await request.file();
    if (!data) throw new ValidationError('No file uploaded');
    const buffer = await data.toBuffer();
    reply.status(201).send(await this.service.uploadImage(Number(id), buffer, data.filename));
  };

  removeImage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, imageId } = request.params as { id: string; imageId: string };
    await this.service.removeImage(Number(id), Number(imageId));
    reply.status(204).send();
  };
}
