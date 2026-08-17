import { IProductAddon } from "./addon.interface.js";

export const PRODUCT_CATEGORIES = {
    Fried: 'Fritti',
    Desserts: 'Dolci',
    Beverage: 'Bevande',
    Pizza: 'Pizza',
    Pastry: 'Rustici',
    Baked: 'Cotti al forno'
} as const;

export const PRODUCT_UNIT_TYPE = {
    PCS: 'Pezzo',
    KG: 'Kilo',
    BAKING_TRAY: 'Teglia'
} as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[keyof typeof PRODUCT_CATEGORIES];
export type ProductUnitType = typeof PRODUCT_UNIT_TYPE[keyof typeof PRODUCT_UNIT_TYPE];

export interface IProduct {
    _id?: string;
    name: string;
    basePrice: number;
    size: number[];
    categories: ProductCategory[];
    available: boolean;
    productImages: string[];
    description: string;
    suggestedQuantity: number;
    addons: IProductAddon[];
    unitType: ProductUnitType;
    lastUpdatedBy: string;
    //TODO: add promotions
    createdAt?: Date
    updatedAt?: Date
}

export interface IStoredProduct extends IProduct {
    createdAt: Date
    updatedAt: Date
}