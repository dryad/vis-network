import NodeBase from "../util/NodeBase";
import { getShape } from "./shapes";

/**
 * Base class for constructing Node/Cluster Shapes.
 *
 * @augments NodeBase
 */
class ShapeBase extends NodeBase {
  /**
   * @param {object} options
   * @param {object} body
   * @param {Label} labelModule
   */
  constructor(options, body, labelModule) {
    super(options, body, labelModule);
  }

  /**
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {boolean} [selected]
   * @param {boolean} [hover]
   * @param {object} [values={size: this.options.size}]
   */
  resize(
    ctx,
    selected = this.selected,
    hover = this.hover,
    values = { size: this.options.size }
  ) {
    if (this.needsRefresh(selected, hover)) {
      this.labelModule.getTextSize(ctx, selected, hover);
      const size = 2 * values.size;
      this.width = this.customSizeWidth ?? size;
      this.height = this.customSizeHeight ?? size;
      this.radius = 0.5 * this.width;
    }
  }

  /**
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} shape
   * @param {number} sizeMultiplier - Unused! TODO: Remove next major release
   * @param {number} x
   * @param {number} y
   * @param {boolean} selected
   * @param {boolean} hover
   * @param {ArrowOptions} values
   * @private
   * @returns {object} Callbacks to draw later on higher layers.
   */
  _drawShape(ctx, shape, sizeMultiplier, x, y, selected, hover, values) {
    if (this.options.isLabelNode == true) {
      // find the node the label belongs to
      // console.log('this.body.nodes', this.body.nodes); // does contain list of nodes by id
      // console.log('this.options.labelOfNode', this.options.labelOfNode);
      const node = this.body.nodes[this.options.labelOfNode];
      // console.log('node', node);

      //set the position of the labelNode relative to the node
      //but must be changed later to an offset field because it will continually add on redraw
      x = node.x + x;
      y = node.y + y;
    }
    this.resize(ctx, selected, hover, values);
    this.left = x - this.width / 2;
    this.top = y - this.height / 2;

    this.initContextForDraw(ctx, values);
    if (this.options.isLabelNode != true) {
      //only draw the shape of non-labelNodes
      getShape(shape)(ctx, x, y, values.size);
    }

    this.performFill(ctx, values);

    if (this.options.icon !== undefined) {
      if (this.options.icon.code !== undefined) {
        ctx.font =
          (selected ? "bold " : "") +
          this.height / 2 +
          "px " +
          (this.options.icon.face || "FontAwesome");
        ctx.fillStyle = this.options.icon.color || "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.options.icon.code, x, y);
      }
    }

    return {
      drawExternalLabel: () => {
        if (this.options.label !== undefined) {
          // Need to call following here in order to ensure value for
          // `this.labelModule.size.height`.
          this.labelModule.calculateLabelSize(
            ctx,
            selected,
            hover,
            x,
            y,
            "hanging"
          );
          const yLabel =
            y + 0.5 * this.height + 0.5 * this.labelModule.size.height;
          this.labelModule.draw(ctx, x, yLabel, selected, hover, "hanging");
        }

        this.updateBoundingBox(x, y);
      },
    };
  }

  /**
   *
   * @param {number} x
   * @param {number} y
   */
  updateBoundingBox(x, y) {
    this.boundingBox.top = y - this.options.size;
    this.boundingBox.left = x - this.options.size;
    this.boundingBox.right = x + this.options.size;
    this.boundingBox.bottom = y + this.options.size;

    if (this.options.label !== undefined && this.labelModule.size.width > 0) {
      this.boundingBox.left = Math.min(
        this.boundingBox.left,
        this.labelModule.size.left
      );
      this.boundingBox.right = Math.max(
        this.boundingBox.right,
        this.labelModule.size.left + this.labelModule.size.width
      );
      this.boundingBox.bottom = Math.max(
        this.boundingBox.bottom,
        this.boundingBox.bottom + this.labelModule.size.height
      );
    }
  }
}

export default ShapeBase;
