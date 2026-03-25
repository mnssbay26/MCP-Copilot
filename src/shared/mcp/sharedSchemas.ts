import { z } from "zod";

export const ListPaginationInputSchemaShape = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of records to return."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Zero-based result offset.")
};

export const ProjectIdSchema = z
  .string()
  .min(1)
  .describe("ACC project identifier. A leading 'b.' prefix is accepted.");

export const SessionKeySchema = z
  .string()
  .min(1)
  .describe("Optional session key used to isolate Autodesk auth per user/session.");
