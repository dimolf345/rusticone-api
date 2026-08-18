import { IBaseServiceInterface } from "../interfaces/base.interface.js";
import { IAddon, IProductAddon } from "../interfaces/products/addon.interface.js";
import { AddonService } from "../services/addon.service.js";
import { BaseController } from "./base.controller.js";

export class AddonsController extends BaseController<IProductAddon, IAddon, IAddon> {
    constructor(service: IBaseServiceInterface<IProductAddon, IAddon, IAddon> = new AddonService()) {
        super(service, 'addon');
    }
}