import mongoose, { model, Schema } from "mongoose";
import { IStoredProduct, PRODUCT_CATEGORIES } from "../interfaces/products/product.interface.js";
import { IProductAddon } from "../interfaces/products/addon.interface.js";

const productSchema = new Schema<IStoredProduct>({
    name: {
        type: String,
        required: true,
        minlength: [5, 'Product name too short']
    },
    basePrice: {
        type: Number,
        required: true,
        default: 0.00,
        min: [0, 'Product price can\'t be negative']
    },
    size: {
        type: [Number],
        required: true,
        default: [1],
        validate: {
            validator: (values: number[]) => values.every(v => v >= 1),
            message: 'A product size is intended to be for at least 1 person'
        }
    },
    categories: {
        type: [String],
        enum: Object.values(PRODUCT_CATEGORIES),
        required: true
    },
    available: Boolean,
    productImages: [String],
    description: String,
    suggestedQuantity: {
        type: Number,
        required: true,
        default: 1,
        min: [1, 'Suggested quantity per person con\'t be negative']
    },
    addons: [Schema.Types.Mixed],
}, { timestamps: true, versionKey: false });

productSchema.post(['find', 'findOne'], async function (docs) {
    if (!docs) return;

    const records = Array.isArray(docs) ? docs : [docs];
    const Addon = model('Addon'); // Target referenced model

    for (const doc of records) {
        if (!doc || !Array.isArray(doc.addons)) continue;

        // Resolve ObjectIds into full Addon documents
        doc.addons = await Promise.all(
            doc.addons.map(async (addonItem: IProductAddon) => {
                // Case A: Item is a raw ObjectId string or Types.ObjectId
                if (addonItem?.referenceId) {
                    const fetchedAddon = await Addon.findById(addonItem?.referenceId).lean().exec();
                    return fetchedAddon || addonItem;
                }

                // Case B: Item is an embedded object (with or without referenceId) -> keep as-is
                return addonItem;
            })
        );
    }
});

export const ProductModel = mongoose.model('Product', productSchema);