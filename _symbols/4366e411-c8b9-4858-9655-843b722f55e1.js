// youtube-player - Updated July 30, 2025
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function stop_propagation(fn) {
    return function (event) {
        event.stopPropagation();
        // @ts-ignore
        return fn.call(this, event);
    };
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function to_number(value) {
    return value === '' ? null : +value;
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_svg_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, svg_element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_input_value(input, value) {
    input.value = value == null ? '' : value;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
/**
 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
 * it can be called from an external module).
 *
 * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
 *
 * https://svelte.dev/docs#run-time-svelte-onmount
 */
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[63] = list[i];
	child_ctx[65] = i;
	return child_ctx;
}

// (1630:6) {:else}
function create_else_block_3(ctx) {
	let div;
	let input;
	let t0;
	let button0;
	let t1;
	let t2;
	let button1;
	let t3;
	let mounted;
	let dispose;

	return {
		c() {
			div = element("div");
			input = element("input");
			t0 = space();
			button0 = element("button");
			t1 = text("Save");
			t2 = space();
			button1 = element("button");
			t3 = text("×");
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);

			input = claim_element(div_nodes, "INPUT", {
				type: true,
				placeholder: true,
				class: true
			});

			t0 = claim_space(div_nodes);
			button0 = claim_element(div_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t1 = claim_text(button0_nodes, "Save");
			button0_nodes.forEach(detach);
			t2 = claim_space(div_nodes);
			button1 = claim_element(div_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t3 = claim_text(button1_nodes, "×");
			button1_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(input, "type", "text");
			attr(input, "placeholder", "Enter API Key");
			attr(input, "class", "api-input svelte-1a1i743");
			attr(button0, "class", "api-save-btn svelte-1a1i743");
			attr(button1, "class", "api-cancel-btn svelte-1a1i743");
			attr(div, "class", "api-input-container svelte-1a1i743");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, input);
			set_input_value(input, /*youtubeApiKey*/ ctx[6]);
			append_hydration(div, t0);
			append_hydration(div, button0);
			append_hydration(button0, t1);
			append_hydration(div, t2);
			append_hydration(div, button1);
			append_hydration(button1, t3);

			if (!mounted) {
				dispose = [
					listen(input, "input", /*input_input_handler*/ ctx[30]),
					listen(input, "keydown", /*keydown_handler_1*/ ctx[31]),
					listen(button0, "click", /*saveApiKey*/ ctx[24]),
					listen(button1, "click", /*toggleApiKeyInput*/ ctx[23])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*youtubeApiKey*/ 64 && input.value !== /*youtubeApiKey*/ ctx[6]) {
				set_input_value(input, /*youtubeApiKey*/ ctx[6]);
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1626:6) {#if !showApiKeyInput}
function create_if_block_3(ctx) {
	let button;

	let t_value = (/*youtubeApiKey*/ ctx[6]
	? 'Change API Key'
	: 'Add Your API Key') + "";

	let t;
	let mounted;
	let dispose;

	return {
		c() {
			button = element("button");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t = claim_text(button_nodes, t_value);
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button, "class", "api-key-btn svelte-1a1i743");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, t);

			if (!mounted) {
				dispose = listen(button, "click", /*toggleApiKeyInput*/ ctx[23]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*youtubeApiKey*/ 64 && t_value !== (t_value = (/*youtubeApiKey*/ ctx[6]
			? 'Change API Key'
			: 'Add Your API Key') + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

// (1702:10) {:else}
function create_else_block_2(ctx) {
	let svg;
	let path;

	return {
		c() {
			svg = svg_element("svg");
			path = svg_element("path");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg_nodes = children(svg);
			path = claim_svg_element(svg_nodes, "path", { d: true });
			children(path).forEach(detach);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(path, "d", "M8 5V19L19 12L8 5Z");
			attr(svg, "width", "28");
			attr(svg, "height", "28");
			attr(svg, "viewBox", "0 0 24 24");
			attr(svg, "fill", "currentColor");
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			append_hydration(svg, path);
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

// (1698:10) {#if isPlaying}
function create_if_block_2(ctx) {
	let svg;
	let path;

	return {
		c() {
			svg = svg_element("svg");
			path = svg_element("path");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg_nodes = children(svg);
			path = claim_svg_element(svg_nodes, "path", { d: true });
			children(path).forEach(detach);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(path, "d", "M6 4h4v16H6V4zm8 0h4v16h-4V4z");
			attr(svg, "width", "28");
			attr(svg, "height", "28");
			attr(svg, "viewBox", "0 0 24 24");
			attr(svg, "fill", "currentColor");
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			append_hydration(svg, path);
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

// (1788:4) {:else}
function create_else_block_1(ctx) {
	let svg;
	let polygon;
	let path;

	return {
		c() {
			svg = svg_element("svg");
			polygon = svg_element("polygon");
			path = svg_element("path");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				class: true
			});

			var svg_nodes = children(svg);
			polygon = claim_svg_element(svg_nodes, "polygon", { points: true });
			children(polygon).forEach(detach);
			path = claim_svg_element(svg_nodes, "path", { d: true });
			children(path).forEach(detach);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(polygon, "points", "11 5 6 9 2 9 2 15 6 15 11 19 11 5");
			attr(path, "d", "M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07");
			attr(svg, "width", "16");
			attr(svg, "height", "16");
			attr(svg, "viewBox", "0 0 24 24");
			attr(svg, "fill", "currentColor");
			attr(svg, "class", "volume-icon");
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			append_hydration(svg, polygon);
			append_hydration(svg, path);
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

// (1783:26) 
function create_if_block_1(ctx) {
	let svg;
	let polygon;
	let path;

	return {
		c() {
			svg = svg_element("svg");
			polygon = svg_element("polygon");
			path = svg_element("path");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				class: true
			});

			var svg_nodes = children(svg);
			polygon = claim_svg_element(svg_nodes, "polygon", { points: true });
			children(polygon).forEach(detach);
			path = claim_svg_element(svg_nodes, "path", { d: true });
			children(path).forEach(detach);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(polygon, "points", "11 5 6 9 2 9 2 15 6 15 11 19 11 5");
			attr(path, "d", "M15.54 8.46a5 5 0 0 1 0 7.07");
			attr(svg, "width", "16");
			attr(svg, "height", "16");
			attr(svg, "viewBox", "0 0 24 24");
			attr(svg, "fill", "currentColor");
			attr(svg, "class", "volume-icon");
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			append_hydration(svg, polygon);
			append_hydration(svg, path);
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

// (1777:4) {#if volume === 0}
function create_if_block(ctx) {
	let svg;
	let polygon;
	let line0;
	let line1;

	return {
		c() {
			svg = svg_element("svg");
			polygon = svg_element("polygon");
			line0 = svg_element("line");
			line1 = svg_element("line");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				class: true
			});

			var svg_nodes = children(svg);
			polygon = claim_svg_element(svg_nodes, "polygon", { points: true });
			children(polygon).forEach(detach);

			line0 = claim_svg_element(svg_nodes, "line", {
				x1: true,
				y1: true,
				x2: true,
				y2: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true
			});

			children(line0).forEach(detach);

			line1 = claim_svg_element(svg_nodes, "line", {
				x1: true,
				y1: true,
				x2: true,
				y2: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true
			});

			children(line1).forEach(detach);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(polygon, "points", "11 5 6 9 2 9 2 15 6 15 11 19 11 5");
			attr(line0, "x1", "23");
			attr(line0, "y1", "9");
			attr(line0, "x2", "17");
			attr(line0, "y2", "15");
			attr(line0, "stroke", "currentColor");
			attr(line0, "stroke-width", "2");
			attr(line0, "stroke-linecap", "round");
			attr(line1, "x1", "17");
			attr(line1, "y1", "9");
			attr(line1, "x2", "23");
			attr(line1, "y2", "15");
			attr(line1, "stroke", "currentColor");
			attr(line1, "stroke-width", "2");
			attr(line1, "stroke-linecap", "round");
			attr(svg, "width", "16");
			attr(svg, "height", "16");
			attr(svg, "viewBox", "0 0 24 24");
			attr(svg, "fill", "currentColor");
			attr(svg, "class", "volume-icon");
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			append_hydration(svg, polygon);
			append_hydration(svg, line0);
			append_hydration(svg, line1);
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

// (1859:8) {:else}
function create_else_block(ctx) {
	let div;
	let p;
	let t0;
	let t1;

	return {
		c() {
			div = element("div");
			p = element("p");
			t0 = text("Your playlist is empty. Search for songs to add them here.");
			t1 = space();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			p = claim_element(div_nodes, "P", {});
			var p_nodes = children(p);
			t0 = claim_text(p_nodes, "Your playlist is empty. Search for songs to add them here.");
			p_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "empty-playlist svelte-1a1i743");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, p);
			append_hydration(p, t0);
			append_hydration(div, t1);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (1832:8) {#each playlist as track, index}
function create_each_block(ctx) {
	let div5;
	let div1;
	let div0;
	let div0_style_value;
	let t0;
	let div4;
	let div2;
	let t1_value = /*track*/ ctx[63].title + "";
	let t1;
	let t2;
	let div3;
	let t3_value = /*track*/ ctx[63].artist + "";
	let t3;
	let t4;
	let button;
	let t5;
	let t6;
	let div5_class_value;
	let div5_aria_label_value;
	let mounted;
	let dispose;

	function click_handler_2() {
		return /*click_handler_2*/ ctx[42](/*index*/ ctx[65]);
	}

	function keydown_handler_8(...args) {
		return /*keydown_handler_8*/ ctx[43](/*index*/ ctx[65], ...args);
	}

	function click_handler_3() {
		return /*click_handler_3*/ ctx[44](/*track*/ ctx[63]);
	}

	function keydown_handler_9(...args) {
		return /*keydown_handler_9*/ ctx[45](/*track*/ ctx[63], ...args);
	}

	return {
		c() {
			div5 = element("div");
			div1 = element("div");
			div0 = element("div");
			t0 = space();
			div4 = element("div");
			div2 = element("div");
			t1 = text(t1_value);
			t2 = space();
			div3 = element("div");
			t3 = text(t3_value);
			t4 = space();
			button = element("button");
			t5 = text("×");
			t6 = space();
			this.h();
		},
		l(nodes) {
			div5 = claim_element(nodes, "DIV", {
				class: true,
				tabindex: true,
				role: true,
				"aria-label": true
			});

			var div5_nodes = children(div5);
			div1 = claim_element(div5_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true, style: true });
			children(div0).forEach(detach);
			div1_nodes.forEach(detach);
			t0 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div2 = claim_element(div4_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			t1 = claim_text(div2_nodes, t1_value);
			div2_nodes.forEach(detach);
			t2 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			t3 = claim_text(div3_nodes, t3_value);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t4 = claim_space(div5_nodes);

			button = claim_element(div5_nodes, "BUTTON", {
				class: true,
				tabindex: true,
				"aria-label": true
			});

			var button_nodes = children(button);
			t5 = claim_text(button_nodes, "×");
			button_nodes.forEach(detach);
			t6 = claim_space(div5_nodes);
			div5_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "artwork-thumb svelte-1a1i743");
			attr(div0, "style", div0_style_value = `background-image: url(https://img.youtube.com/vi/${/*track*/ ctx[63].videoId}/default.jpg); background-size: cover;`);
			attr(div1, "class", "playlist-artwork svelte-1a1i743");
			attr(div2, "class", "playlist-track svelte-1a1i743");
			attr(div3, "class", "playlist-artist svelte-1a1i743");
			attr(div4, "class", "playlist-info svelte-1a1i743");
			attr(button, "class", "remove-btn svelte-1a1i743");
			attr(button, "tabindex", "0");
			attr(button, "aria-label", "Remove from playlist");

			attr(div5, "class", div5_class_value = "playlist-item " + (/*currentTrackIndex*/ ctx[8] === /*index*/ ctx[65]
			? 'active'
			: '') + " svelte-1a1i743");

			attr(div5, "tabindex", "0");
			attr(div5, "role", "button");
			attr(div5, "aria-label", div5_aria_label_value = "Play " + /*track*/ ctx[63].title);
		},
		m(target, anchor) {
			insert_hydration(target, div5, anchor);
			append_hydration(div5, div1);
			append_hydration(div1, div0);
			append_hydration(div5, t0);
			append_hydration(div5, div4);
			append_hydration(div4, div2);
			append_hydration(div2, t1);
			append_hydration(div4, t2);
			append_hydration(div4, div3);
			append_hydration(div3, t3);
			append_hydration(div5, t4);
			append_hydration(div5, button);
			append_hydration(button, t5);
			append_hydration(div5, t6);

			if (!mounted) {
				dispose = [
					listen(button, "click", stop_propagation(click_handler_2)),
					listen(button, "keydown", stop_propagation(keydown_handler_8)),
					listen(div5, "click", click_handler_3),
					listen(div5, "keydown", keydown_handler_9)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty[0] & /*playlist*/ 128 && div0_style_value !== (div0_style_value = `background-image: url(https://img.youtube.com/vi/${/*track*/ ctx[63].videoId}/default.jpg); background-size: cover;`)) {
				attr(div0, "style", div0_style_value);
			}

			if (dirty[0] & /*playlist*/ 128 && t1_value !== (t1_value = /*track*/ ctx[63].title + "")) set_data(t1, t1_value);
			if (dirty[0] & /*playlist*/ 128 && t3_value !== (t3_value = /*track*/ ctx[63].artist + "")) set_data(t3, t3_value);

			if (dirty[0] & /*currentTrackIndex*/ 256 && div5_class_value !== (div5_class_value = "playlist-item " + (/*currentTrackIndex*/ ctx[8] === /*index*/ ctx[65]
			? 'active'
			: '') + " svelte-1a1i743")) {
				attr(div5, "class", div5_class_value);
			}

			if (dirty[0] & /*playlist*/ 128 && div5_aria_label_value !== (div5_aria_label_value = "Play " + /*track*/ ctx[63].title)) {
				attr(div5, "aria-label", div5_aria_label_value);
			}
		},
		d(detaching) {
			if (detaching) detach(div5);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let div20;
	let header;
	let div0;
	let span0;
	let t0;
	let t1;
	let span1;
	let t2;
	let t3;
	let div1;
	let input0;
	let t4;
	let button0;
	let svg0;
	let circle;
	let path0;
	let t5;
	let div2;
	let t6;
	let main;
	let section;
	let div6;
	let div5;
	let div4;
	let div3;
	let div3_style_value;
	let t7;
	let div7;
	let h2;

	let t8_value = (/*currentTrackInfo*/ ctx[9]
	? /*currentTrackInfo*/ ctx[9].title
	: 'Midnight Serenade') + "";

	let t8;
	let t9;
	let p;

	let t10_value = (/*currentTrackInfo*/ ctx[9]
	? /*currentTrackInfo*/ ctx[9].artist
	: 'Luna Beats') + "";

	let t10;
	let t11;
	let div8;
	let button1;
	let svg1;
	let path1;
	let t12;
	let button2;
	let svg2;
	let path2;
	let t13;
	let button3;
	let button3_aria_label_value;
	let t14;
	let button4;
	let svg3;
	let path3;
	let t15;
	let button5;
	let svg4;
	let path4;
	let t16;
	let div13;
	let div9;
	let span2;
	let t17_value = formatTime(/*currentTime*/ ctx[2]) + "";
	let t17;
	let t18;
	let span3;
	let t19_value = formatTime(/*duration*/ ctx[3]) + "";
	let t19;
	let t20;
	let div12;
	let div10;
	let div10_style_value;
	let t21;
	let div11;
	let div11_style_value;
	let div12_aria_valuenow_value;
	let t22;
	let div16;
	let button6;
	let t23;
	let div15;
	let input1;
	let t24;
	let div14;
	let t25;
	let t26;
	let t27;
	let div17;
	let button7;
	let t28;
	let t29;
	let button8;
	let t30;
	let t31;
	let aside;
	let h3;
	let t32;
	let t33;
	let div18;
	let t34;
	let div19;
	let mounted;
	let dispose;

	function select_block_type(ctx, dirty) {
		if (!/*showApiKeyInput*/ ctx[11]) return create_if_block_3;
		return create_else_block_3;
	}

	let current_block_type = select_block_type(ctx);
	let if_block0 = current_block_type(ctx);

	function select_block_type_1(ctx, dirty) {
		if (/*isPlaying*/ ctx[1]) return create_if_block_2;
		return create_else_block_2;
	}

	let current_block_type_1 = select_block_type_1(ctx);
	let if_block1 = current_block_type_1(ctx);

	function select_block_type_2(ctx, dirty) {
		if (/*volume*/ ctx[4] === 0) return create_if_block;
		if (/*volume*/ ctx[4] < 50) return create_if_block_1;
		return create_else_block_1;
	}

	let current_block_type_2 = select_block_type_2(ctx);
	let if_block2 = current_block_type_2(ctx);
	let each_value = /*playlist*/ ctx[7];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	let each_1_else = null;

	if (!each_value.length) {
		each_1_else = create_else_block();
	}

	return {
		c() {
			div20 = element("div");
			header = element("header");
			div0 = element("div");
			span0 = element("span");
			t0 = text("🎵");
			t1 = space();
			span1 = element("span");
			t2 = text("Harmony");
			t3 = space();
			div1 = element("div");
			input0 = element("input");
			t4 = space();
			button0 = element("button");
			svg0 = svg_element("svg");
			circle = svg_element("circle");
			path0 = svg_element("path");
			t5 = space();
			div2 = element("div");
			if_block0.c();
			t6 = space();
			main = element("main");
			section = element("section");
			div6 = element("div");
			div5 = element("div");
			div4 = element("div");
			div3 = element("div");
			t7 = space();
			div7 = element("div");
			h2 = element("h2");
			t8 = text(t8_value);
			t9 = space();
			p = element("p");
			t10 = text(t10_value);
			t11 = space();
			div8 = element("div");
			button1 = element("button");
			svg1 = svg_element("svg");
			path1 = svg_element("path");
			t12 = space();
			button2 = element("button");
			svg2 = svg_element("svg");
			path2 = svg_element("path");
			t13 = space();
			button3 = element("button");
			if_block1.c();
			t14 = space();
			button4 = element("button");
			svg3 = svg_element("svg");
			path3 = svg_element("path");
			t15 = space();
			button5 = element("button");
			svg4 = svg_element("svg");
			path4 = svg_element("path");
			t16 = space();
			div13 = element("div");
			div9 = element("div");
			span2 = element("span");
			t17 = text(t17_value);
			t18 = space();
			span3 = element("span");
			t19 = text(t19_value);
			t20 = space();
			div12 = element("div");
			div10 = element("div");
			t21 = space();
			div11 = element("div");
			t22 = space();
			div16 = element("div");
			button6 = element("button");
			if_block2.c();
			t23 = space();
			div15 = element("div");
			input1 = element("input");
			t24 = space();
			div14 = element("div");
			t25 = text(/*volume*/ ctx[4]);
			t26 = text("%");
			t27 = space();
			div17 = element("div");
			button7 = element("button");
			t28 = text("Search Lyrics");
			t29 = space();
			button8 = element("button");
			t30 = text("Save Playlist");
			t31 = space();
			aside = element("aside");
			h3 = element("h3");
			t32 = text("Playlist");
			t33 = space();
			div18 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			if (each_1_else) {
				each_1_else.c();
			}

			t34 = space();
			div19 = element("div");
			this.h();
		},
		l(nodes) {
			div20 = claim_element(nodes, "DIV", { class: true });
			var div20_nodes = children(div20);
			header = claim_element(div20_nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			div0 = claim_element(header_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			span0 = claim_element(div0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, "🎵");
			span0_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			span1 = claim_element(div0_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t2 = claim_text(span1_nodes, "Harmony");
			span1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(header_nodes);
			div1 = claim_element(header_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);

			input0 = claim_element(div1_nodes, "INPUT", {
				type: true,
				placeholder: true,
				class: true
			});

			t4 = claim_space(div1_nodes);
			button0 = claim_element(div1_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);

			svg0 = claim_svg_element(button0_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true
			});

			var svg0_nodes = children(svg0);
			circle = claim_svg_element(svg0_nodes, "circle", { cx: true, cy: true, r: true });
			children(circle).forEach(detach);
			path0 = claim_svg_element(svg0_nodes, "path", { d: true });
			children(path0).forEach(detach);
			svg0_nodes.forEach(detach);
			button0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t5 = claim_space(header_nodes);
			div2 = claim_element(header_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			if_block0.l(div2_nodes);
			div2_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t6 = claim_space(div20_nodes);
			main = claim_element(div20_nodes, "MAIN", { class: true });
			var main_nodes = children(main);
			section = claim_element(main_nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			div6 = claim_element(section_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div3 = claim_element(div4_nodes, "DIV", { class: true, style: true });
			children(div3).forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t7 = claim_space(section_nodes);
			div7 = claim_element(section_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			h2 = claim_element(div7_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t8 = claim_text(h2_nodes, t8_value);
			h2_nodes.forEach(detach);
			t9 = claim_space(div7_nodes);
			p = claim_element(div7_nodes, "P", { class: true });
			var p_nodes = children(p);
			t10 = claim_text(p_nodes, t10_value);
			p_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t11 = claim_space(section_nodes);
			div8 = claim_element(section_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);

			button1 = claim_element(div8_nodes, "BUTTON", {
				class: true,
				tabindex: true,
				"aria-label": true
			});

			var button1_nodes = children(button1);

			svg1 = claim_svg_element(button1_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg1_nodes = children(svg1);
			path1 = claim_svg_element(svg1_nodes, "path", { d: true });
			children(path1).forEach(detach);
			svg1_nodes.forEach(detach);
			button1_nodes.forEach(detach);
			t12 = claim_space(div8_nodes);

			button2 = claim_element(div8_nodes, "BUTTON", {
				class: true,
				tabindex: true,
				"aria-label": true
			});

			var button2_nodes = children(button2);

			svg2 = claim_svg_element(button2_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg2_nodes = children(svg2);
			path2 = claim_svg_element(svg2_nodes, "path", { d: true });
			children(path2).forEach(detach);
			svg2_nodes.forEach(detach);
			button2_nodes.forEach(detach);
			t13 = claim_space(div8_nodes);

			button3 = claim_element(div8_nodes, "BUTTON", {
				class: true,
				tabindex: true,
				"aria-label": true
			});

			var button3_nodes = children(button3);
			if_block1.l(button3_nodes);
			button3_nodes.forEach(detach);
			t14 = claim_space(div8_nodes);

			button4 = claim_element(div8_nodes, "BUTTON", {
				class: true,
				tabindex: true,
				"aria-label": true
			});

			var button4_nodes = children(button4);

			svg3 = claim_svg_element(button4_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg3_nodes = children(svg3);
			path3 = claim_svg_element(svg3_nodes, "path", { d: true });
			children(path3).forEach(detach);
			svg3_nodes.forEach(detach);
			button4_nodes.forEach(detach);
			t15 = claim_space(div8_nodes);

			button5 = claim_element(div8_nodes, "BUTTON", {
				class: true,
				tabindex: true,
				"aria-label": true
			});

			var button5_nodes = children(button5);

			svg4 = claim_svg_element(button5_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg4_nodes = children(svg4);
			path4 = claim_svg_element(svg4_nodes, "path", { d: true });
			children(path4).forEach(detach);
			svg4_nodes.forEach(detach);
			button5_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t16 = claim_space(section_nodes);
			div13 = claim_element(section_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			div9 = claim_element(div13_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			span2 = claim_element(div9_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t17 = claim_text(span2_nodes, t17_value);
			span2_nodes.forEach(detach);
			t18 = claim_space(div9_nodes);
			span3 = claim_element(div9_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t19 = claim_text(span3_nodes, t19_value);
			span3_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			t20 = claim_space(div13_nodes);

			div12 = claim_element(div13_nodes, "DIV", {
				class: true,
				tabindex: true,
				role: true,
				"aria-label": true,
				"aria-valuemin": true,
				"aria-valuemax": true,
				"aria-valuenow": true
			});

			var div12_nodes = children(div12);
			div10 = claim_element(div12_nodes, "DIV", { class: true, style: true });
			children(div10).forEach(detach);
			t21 = claim_space(div12_nodes);
			div11 = claim_element(div12_nodes, "DIV", { class: true, style: true });
			children(div11).forEach(detach);
			div12_nodes.forEach(detach);
			div13_nodes.forEach(detach);
			t22 = claim_space(section_nodes);
			div16 = claim_element(section_nodes, "DIV", { class: true });
			var div16_nodes = children(div16);
			button6 = claim_element(div16_nodes, "BUTTON", { class: true, "aria-label": true });
			var button6_nodes = children(button6);
			if_block2.l(button6_nodes);
			button6_nodes.forEach(detach);
			t23 = claim_space(div16_nodes);
			div15 = claim_element(div16_nodes, "DIV", { class: true });
			var div15_nodes = children(div15);

			input1 = claim_element(div15_nodes, "INPUT", {
				type: true,
				min: true,
				max: true,
				class: true,
				"aria-label": true
			});

			t24 = claim_space(div15_nodes);
			div14 = claim_element(div15_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			t25 = claim_text(div14_nodes, /*volume*/ ctx[4]);
			t26 = claim_text(div14_nodes, "%");
			div14_nodes.forEach(detach);
			div15_nodes.forEach(detach);
			div16_nodes.forEach(detach);
			t27 = claim_space(section_nodes);
			div17 = claim_element(section_nodes, "DIV", { class: true });
			var div17_nodes = children(div17);
			button7 = claim_element(div17_nodes, "BUTTON", { class: true, tabindex: true });
			var button7_nodes = children(button7);
			t28 = claim_text(button7_nodes, "Search Lyrics");
			button7_nodes.forEach(detach);
			t29 = claim_space(div17_nodes);
			button8 = claim_element(div17_nodes, "BUTTON", { class: true, tabindex: true });
			var button8_nodes = children(button8);
			t30 = claim_text(button8_nodes, "Save Playlist");
			button8_nodes.forEach(detach);
			div17_nodes.forEach(detach);
			section_nodes.forEach(detach);
			t31 = claim_space(main_nodes);
			aside = claim_element(main_nodes, "ASIDE", { class: true });
			var aside_nodes = children(aside);
			h3 = claim_element(aside_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t32 = claim_text(h3_nodes, "Playlist");
			h3_nodes.forEach(detach);
			t33 = claim_space(aside_nodes);
			div18 = claim_element(aside_nodes, "DIV", { class: true });
			var div18_nodes = children(div18);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div18_nodes);
			}

			if (each_1_else) {
				each_1_else.l(div18_nodes);
			}

			div18_nodes.forEach(detach);
			aside_nodes.forEach(detach);
			main_nodes.forEach(detach);
			t34 = claim_space(div20_nodes);
			div19 = claim_element(div20_nodes, "DIV", { id: true });
			children(div19).forEach(detach);
			div20_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "logo-icon svelte-1a1i743");
			attr(span1, "class", "logo-text");
			attr(div0, "class", "logo svelte-1a1i743");
			attr(input0, "type", "text");
			attr(input0, "placeholder", "Search");
			attr(input0, "class", "search-input svelte-1a1i743");
			attr(circle, "cx", "11");
			attr(circle, "cy", "11");
			attr(circle, "r", "8");
			attr(path0, "d", "m21 21-4.35-4.35");
			attr(svg0, "width", "16");
			attr(svg0, "height", "16");
			attr(svg0, "viewBox", "0 0 24 24");
			attr(svg0, "fill", "none");
			attr(svg0, "stroke", "currentColor");
			attr(svg0, "stroke-width", "2");
			attr(button0, "class", "search-btn svelte-1a1i743");
			attr(div1, "class", "search-container svelte-1a1i743");
			attr(div2, "class", "api-section svelte-1a1i743");
			attr(header, "class", "header svelte-1a1i743");
			attr(div3, "class", "artwork-inner svelte-1a1i743");

			attr(div3, "style", div3_style_value = /*thumbnailUrl*/ ctx[10]
			? `background-image: url(${/*thumbnailUrl*/ ctx[10]}); background-size: cover; background-position: center;`
			: '');

			attr(div4, "class", "artwork-image svelte-1a1i743");
			attr(div5, "class", "artwork-container svelte-1a1i743");
			attr(div6, "class", "album-artwork svelte-1a1i743");
			attr(h2, "class", "track-title svelte-1a1i743");
			attr(p, "class", "artist-name svelte-1a1i743");
			attr(div7, "class", "track-info svelte-1a1i743");
			attr(path1, "d", "M14.83 13.41L13.42 14.82L16.55 17.95L14.5 20H20V14.5L17.96 16.54L14.83 13.41M14.5 4L16.54 6.04L4 18.59L5.41 20L17.96 7.46L20 9.5V4M10.59 9.17L5.41 4L4 5.41L9.17 10.58L10.59 9.17Z");
			attr(svg1, "width", "20");
			attr(svg1, "height", "20");
			attr(svg1, "viewBox", "0 0 24 24");
			attr(svg1, "fill", "currentColor");
			attr(button1, "class", "control-btn svelte-1a1i743");
			attr(button1, "tabindex", "0");
			attr(button1, "aria-label", "Shuffle");
			attr(path2, "d", "M6 6H4V18H6V6M9.5 12L18 6V18L9.5 12Z");
			attr(svg2, "width", "24");
			attr(svg2, "height", "24");
			attr(svg2, "viewBox", "0 0 24 24");
			attr(svg2, "fill", "currentColor");
			attr(button2, "class", "control-btn svelte-1a1i743");
			attr(button2, "tabindex", "0");
			attr(button2, "aria-label", "Previous track");
			attr(button3, "class", "control-btn play-btn svelte-1a1i743");
			attr(button3, "tabindex", "0");
			attr(button3, "aria-label", button3_aria_label_value = /*isPlaying*/ ctx[1] ? "Pause" : "Play");
			attr(path3, "d", "M16 18H18V6H16V18M6 18L14.5 12L6 6V18Z");
			attr(svg3, "width", "24");
			attr(svg3, "height", "24");
			attr(svg3, "viewBox", "0 0 24 24");
			attr(svg3, "fill", "currentColor");
			attr(button4, "class", "control-btn svelte-1a1i743");
			attr(button4, "tabindex", "0");
			attr(button4, "aria-label", "Next track");
			attr(path4, "d", "M17 17H7V14L3 18L7 22V19H19V13H17M7 7H17V10L21 6L17 2V5H5V11H7V7Z");
			attr(svg4, "width", "20");
			attr(svg4, "height", "20");
			attr(svg4, "viewBox", "0 0 24 24");
			attr(svg4, "fill", "currentColor");
			attr(button5, "class", "control-btn svelte-1a1i743");
			attr(button5, "tabindex", "0");
			attr(button5, "aria-label", "Repeat");
			attr(div8, "class", "player-controls svelte-1a1i743");
			attr(span2, "class", "current-time");
			attr(span3, "class", "total-time");
			attr(div9, "class", "time-display svelte-1a1i743");
			attr(div10, "class", "progress-fill svelte-1a1i743");

			attr(div10, "style", div10_style_value = `width: ${/*duration*/ ctx[3]
			? /*currentTime*/ ctx[2] / /*duration*/ ctx[3] * 100
			: 0}%`);

			attr(div11, "class", "progress-handle svelte-1a1i743");

			attr(div11, "style", div11_style_value = `left: ${/*duration*/ ctx[3]
			? /*currentTime*/ ctx[2] / /*duration*/ ctx[3] * 100
			: 0}%`);

			attr(div12, "class", "progress-bar svelte-1a1i743");
			attr(div12, "tabindex", "0");
			attr(div12, "role", "slider");
			attr(div12, "aria-label", "Playback position");
			attr(div12, "aria-valuemin", "0");
			attr(div12, "aria-valuemax", "100");

			attr(div12, "aria-valuenow", div12_aria_valuenow_value = /*duration*/ ctx[3]
			? /*currentTime*/ ctx[2] / /*duration*/ ctx[3] * 100
			: 0);

			attr(div13, "class", "progress-container svelte-1a1i743");
			attr(button6, "class", "volume-button svelte-1a1i743");
			attr(button6, "aria-label", "Toggle mute");
			attr(input1, "type", "range");
			attr(input1, "min", "0");
			attr(input1, "max", "100");
			attr(input1, "class", "volume-slider svelte-1a1i743");
			attr(input1, "aria-label", "Volume control");
			attr(div14, "class", "volume-indicator svelte-1a1i743");
			attr(div15, "class", "volume-slider-container svelte-1a1i743");
			attr(div16, "class", "volume-control svelte-1a1i743");
			attr(button7, "class", "action-btn secondary svelte-1a1i743");
			attr(button7, "tabindex", "0");
			attr(button8, "class", "action-btn primary svelte-1a1i743");
			attr(button8, "tabindex", "0");
			attr(div17, "class", "action-buttons svelte-1a1i743");
			attr(section, "class", "player-section svelte-1a1i743");
			attr(h3, "class", "playlist-title svelte-1a1i743");
			attr(div18, "class", "playlist-items svelte-1a1i743");
			attr(aside, "class", "playlist-section svelte-1a1i743");
			attr(main, "class", "main-content svelte-1a1i743");
			attr(div19, "id", "youtube-player");
			attr(div20, "class", "app svelte-1a1i743");
		},
		m(target, anchor) {
			insert_hydration(target, div20, anchor);
			append_hydration(div20, header);
			append_hydration(header, div0);
			append_hydration(div0, span0);
			append_hydration(span0, t0);
			append_hydration(div0, t1);
			append_hydration(div0, span1);
			append_hydration(span1, t2);
			append_hydration(header, t3);
			append_hydration(header, div1);
			append_hydration(div1, input0);
			set_input_value(input0, /*searchQuery*/ ctx[5]);
			append_hydration(div1, t4);
			append_hydration(div1, button0);
			append_hydration(button0, svg0);
			append_hydration(svg0, circle);
			append_hydration(svg0, path0);
			append_hydration(header, t5);
			append_hydration(header, div2);
			if_block0.m(div2, null);
			append_hydration(div20, t6);
			append_hydration(div20, main);
			append_hydration(main, section);
			append_hydration(section, div6);
			append_hydration(div6, div5);
			append_hydration(div5, div4);
			append_hydration(div4, div3);
			append_hydration(section, t7);
			append_hydration(section, div7);
			append_hydration(div7, h2);
			append_hydration(h2, t8);
			append_hydration(div7, t9);
			append_hydration(div7, p);
			append_hydration(p, t10);
			append_hydration(section, t11);
			append_hydration(section, div8);
			append_hydration(div8, button1);
			append_hydration(button1, svg1);
			append_hydration(svg1, path1);
			append_hydration(div8, t12);
			append_hydration(div8, button2);
			append_hydration(button2, svg2);
			append_hydration(svg2, path2);
			append_hydration(div8, t13);
			append_hydration(div8, button3);
			if_block1.m(button3, null);
			append_hydration(div8, t14);
			append_hydration(div8, button4);
			append_hydration(button4, svg3);
			append_hydration(svg3, path3);
			append_hydration(div8, t15);
			append_hydration(div8, button5);
			append_hydration(button5, svg4);
			append_hydration(svg4, path4);
			append_hydration(section, t16);
			append_hydration(section, div13);
			append_hydration(div13, div9);
			append_hydration(div9, span2);
			append_hydration(span2, t17);
			append_hydration(div9, t18);
			append_hydration(div9, span3);
			append_hydration(span3, t19);
			append_hydration(div13, t20);
			append_hydration(div13, div12);
			append_hydration(div12, div10);
			/*div10_binding*/ ctx[37](div10);
			append_hydration(div12, t21);
			append_hydration(div12, div11);
			/*div12_binding*/ ctx[38](div12);
			append_hydration(section, t22);
			append_hydration(section, div16);
			append_hydration(div16, button6);
			if_block2.m(button6, null);
			append_hydration(div16, t23);
			append_hydration(div16, div15);
			append_hydration(div15, input1);
			set_input_value(input1, /*volume*/ ctx[4]);
			append_hydration(div15, t24);
			append_hydration(div15, div14);
			append_hydration(div14, t25);
			append_hydration(div14, t26);
			append_hydration(section, t27);
			append_hydration(section, div17);
			append_hydration(div17, button7);
			append_hydration(button7, t28);
			append_hydration(div17, t29);
			append_hydration(div17, button8);
			append_hydration(button8, t30);
			append_hydration(main, t31);
			append_hydration(main, aside);
			append_hydration(aside, h3);
			append_hydration(h3, t32);
			append_hydration(aside, t33);
			append_hydration(aside, div18);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div18, null);
				}
			}

			if (each_1_else) {
				each_1_else.m(div18, null);
			}

			append_hydration(div20, t34);
			append_hydration(div20, div19);

			if (!mounted) {
				dispose = [
					listen(input0, "input", /*input0_input_handler*/ ctx[28]),
					listen(input0, "keydown", /*keydown_handler*/ ctx[29]),
					listen(button0, "click", /*searchYouTube*/ ctx[21]),
					listen(button1, "click", click_handler),
					listen(button1, "keydown", /*keydown_handler_2*/ ctx[32]),
					listen(button2, "click", /*playPreviousTrack*/ ctx[18]),
					listen(button2, "keydown", /*keydown_handler_3*/ ctx[33]),
					listen(button3, "click", /*togglePlay*/ ctx[15]),
					listen(button3, "keydown", /*keydown_handler_4*/ ctx[34]),
					listen(button4, "click", /*playNextTrack*/ ctx[17]),
					listen(button4, "keydown", /*keydown_handler_5*/ ctx[35]),
					listen(button5, "click", click_handler_1),
					listen(button5, "keydown", /*keydown_handler_6*/ ctx[36]),
					listen(div12, "click", /*handleProgressBarClick*/ ctx[20]),
					listen(div12, "keydown", /*keydown_handler_7*/ ctx[39]),
					listen(button6, "click", /*toggleMute*/ ctx[14]),
					listen(input1, "change", /*input1_change_input_handler*/ ctx[40]),
					listen(input1, "input", /*input1_change_input_handler*/ ctx[40]),
					listen(input1, "input", /*input_handler*/ ctx[41]),
					listen(button7, "click", /*searchLyrics*/ ctx[25]),
					listen(button8, "click", /*savePlaylist*/ ctx[26])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*searchQuery*/ 32 && input0.value !== /*searchQuery*/ ctx[5]) {
				set_input_value(input0, /*searchQuery*/ ctx[5]);
			}

			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
				if_block0.p(ctx, dirty);
			} else {
				if_block0.d(1);
				if_block0 = current_block_type(ctx);

				if (if_block0) {
					if_block0.c();
					if_block0.m(div2, null);
				}
			}

			if (dirty[0] & /*thumbnailUrl*/ 1024 && div3_style_value !== (div3_style_value = /*thumbnailUrl*/ ctx[10]
			? `background-image: url(${/*thumbnailUrl*/ ctx[10]}); background-size: cover; background-position: center;`
			: '')) {
				attr(div3, "style", div3_style_value);
			}

			if (dirty[0] & /*currentTrackInfo*/ 512 && t8_value !== (t8_value = (/*currentTrackInfo*/ ctx[9]
			? /*currentTrackInfo*/ ctx[9].title
			: 'Midnight Serenade') + "")) set_data(t8, t8_value);

			if (dirty[0] & /*currentTrackInfo*/ 512 && t10_value !== (t10_value = (/*currentTrackInfo*/ ctx[9]
			? /*currentTrackInfo*/ ctx[9].artist
			: 'Luna Beats') + "")) set_data(t10, t10_value);

			if (current_block_type_1 !== (current_block_type_1 = select_block_type_1(ctx))) {
				if_block1.d(1);
				if_block1 = current_block_type_1(ctx);

				if (if_block1) {
					if_block1.c();
					if_block1.m(button3, null);
				}
			}

			if (dirty[0] & /*isPlaying*/ 2 && button3_aria_label_value !== (button3_aria_label_value = /*isPlaying*/ ctx[1] ? "Pause" : "Play")) {
				attr(button3, "aria-label", button3_aria_label_value);
			}

			if (dirty[0] & /*currentTime*/ 4 && t17_value !== (t17_value = formatTime(/*currentTime*/ ctx[2]) + "")) set_data(t17, t17_value);
			if (dirty[0] & /*duration*/ 8 && t19_value !== (t19_value = formatTime(/*duration*/ ctx[3]) + "")) set_data(t19, t19_value);

			if (dirty[0] & /*duration, currentTime*/ 12 && div10_style_value !== (div10_style_value = `width: ${/*duration*/ ctx[3]
			? /*currentTime*/ ctx[2] / /*duration*/ ctx[3] * 100
			: 0}%`)) {
				attr(div10, "style", div10_style_value);
			}

			if (dirty[0] & /*duration, currentTime*/ 12 && div11_style_value !== (div11_style_value = `left: ${/*duration*/ ctx[3]
			? /*currentTime*/ ctx[2] / /*duration*/ ctx[3] * 100
			: 0}%`)) {
				attr(div11, "style", div11_style_value);
			}

			if (dirty[0] & /*duration, currentTime*/ 12 && div12_aria_valuenow_value !== (div12_aria_valuenow_value = /*duration*/ ctx[3]
			? /*currentTime*/ ctx[2] / /*duration*/ ctx[3] * 100
			: 0)) {
				attr(div12, "aria-valuenow", div12_aria_valuenow_value);
			}

			if (current_block_type_2 !== (current_block_type_2 = select_block_type_2(ctx))) {
				if_block2.d(1);
				if_block2 = current_block_type_2(ctx);

				if (if_block2) {
					if_block2.c();
					if_block2.m(button6, null);
				}
			}

			if (dirty[0] & /*volume*/ 16) {
				set_input_value(input1, /*volume*/ ctx[4]);
			}

			if (dirty[0] & /*volume*/ 16) set_data(t25, /*volume*/ ctx[4]);

			if (dirty[0] & /*currentTrackIndex, playlist, playVideo, removeFromPlaylist*/ 4260224) {
				each_value = /*playlist*/ ctx[7];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div18, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;

				if (!each_value.length && each_1_else) {
					each_1_else.p(ctx, dirty);
				} else if (!each_value.length) {
					each_1_else = create_else_block();
					each_1_else.c();
					each_1_else.m(div18, null);
				} else if (each_1_else) {
					each_1_else.d(1);
					each_1_else = null;
				}
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div20);
			if_block0.d();
			if_block1.d();
			/*div10_binding*/ ctx[37](null);
			/*div12_binding*/ ctx[38](null);
			if_block2.d();
			destroy_each(each_blocks, detaching);
			if (each_1_else) each_1_else.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function formatTime(seconds) {
	if (!seconds) return '0:00';
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Fetch Lyrics
async function fetchLyrics(query, modal) {
	const resultsContainer = modal.querySelector('.lyrics-results');
	resultsContainer.innerHTML = '<p>Searching for lyrics...</p>';

	try {
		const response = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`);
		if (!response.ok) throw new Error('Failed to search lyrics');
		const data = await response.json();

		if (data.data && data.data.length > 0) {
			resultsContainer.innerHTML = `
          <div class="lyrics-results-list">
            ${data.data.slice(0, 5).map((item, index) => `
              <div class="lyrics-result-item">
                <div class="lyrics-result-info">
                  <div class="lyrics-result-title">${item.title}</div>
                  <div class="lyrics-result-artist">${item.artist.name}</div>
                </div>
                <button class="get-lyrics-btn" data-title="${item.title}" data-artist="${item.artist.name}">
                  Get Lyrics
                </button>
              </div>
            `).join('')}
          </div>
        `;

			// Add event listeners to get lyrics buttons
			const getLyricsBtns = resultsContainer.querySelectorAll('.get-lyrics-btn');

			getLyricsBtns.forEach(btn => {
				btn.addEventListener('click', () => {
					const title = btn.dataset.title;
					const artist = btn.dataset.artist;
					getLyrics(title, artist, modal);
				});
			});
		} else {
			resultsContainer.innerHTML = '<p>No results found</p>';
		}
	} catch(error) {
		console.error('Error searching lyrics:', error);
		resultsContainer.innerHTML = '<p>Error searching for lyrics. Please try again.</p>';
	}
}

// Get Lyrics
async function getLyrics(title, artist, modal) {
	const resultsContainer = modal.querySelector('.lyrics-results');
	resultsContainer.innerHTML = '<p>Loading lyrics...</p>';

	try {
		const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
		if (!response.ok) throw new Error('Lyrics not found');
		const data = await response.json();

		if (data.lyrics) {
			resultsContainer.innerHTML = `
          <div class="lyrics-content">
            <h3>${title} - ${artist}</h3>
            <pre>${data.lyrics}</pre>
          </div>
        `;
		} else {
			resultsContainer.innerHTML = '<p>Lyrics not available for this song</p>';
		}
	} catch(error) {
		console.error('Error fetching lyrics:', error);
		resultsContainer.innerHTML = '<p>Could not retrieve lyrics. Please try another song.</p>';
	}
}

// Handle keyboard accessibility
function handleKeyDown(event, action) {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		action();
	}
}

const click_handler = () => {
	
}; /* Toggle shuffle */

const click_handler_1 = () => {
	
}; /* Toggle repeat */

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;

	// Reactive state variables
	let player;

	let supabase;
	let isPlayerReady = false;
	let isPlaying = false;
	let currentTime = 0;
	let duration = 0;
	let volume = 60;
	let searchQuery = '';
	let youtubeApiKey = '';
	let playlist = [];
	let searchResults = [];
	let currentVideoId = '';
	let currentTrackIndex = -1;
	let currentTrackInfo = null;
	let thumbnailUrl = '';
	let displayedResults = 5;
	let showApiKeyInput = false;

	// DOM element references
	let progressBar;

	let progressFill;
	let previousVolume = null;

	function toggleMute() {
		if (volume === 0) {
			// If currently muted, restore to previous volume or default to 50%
			setVolume(previousVolume || 50);
		} else {
			// Store current volume before muting
			previousVolume = volume;

			setVolume(0);
		}
	}

	// Load saved data on mount
	onMount(async () => {
		try {
			// Make sure the script is loaded first
			if (!window.supabase) {
				debug('Supabase not found in window object');
				error = 'Supabase client not loaded. Please add the script tag to your HTML.';
				return;
			}

			const { createClient } = window.supabase;
			supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_ANON_KEY');
			debug('Supabase client initialized');

			// Check for existing session
			const { data: { session }, error: sessionError } = await supabase.auth.getSession();

			if (sessionError) {
				debug('Session error', sessionError);
				error = sessionError.message;
			} else if (session) {
				user = session.user;
				debug('User logged in', user.email);

				// Load API key
				await loadApiKey();

				// Load user playlists
				await loadUserPlaylists();
			}
		} catch(e) {
			debug('Supabase initialization error', e);
			error = e.message;
		}

		// Load saved API key
		const savedApiKey = localStorage.getItem('youtubeApiKey');

		if (savedApiKey) {
			$$invalidate(6, youtubeApiKey = savedApiKey);
		}

		// Load saved playlist
		const savedPlaylist = localStorage.getItem('currentPlaylist');

		if (savedPlaylist) {
			try {
				$$invalidate(7, playlist = JSON.parse(savedPlaylist));
			} catch(e) {
				console.error('Error loading saved playlist:', e);
			}
		}

		// Load YouTube API
		loadYouTubeAPI();

		// Set up interval for time updates
		const timeUpdateInterval = setInterval(
			() => {
				if (isPlaying && player && player.getCurrentTime && player.getDuration) {
					$$invalidate(2, currentTime = player.getCurrentTime());
					$$invalidate(3, duration = player.getDuration());
				}
			},
			1000
		);

		// Cleanup on destroy
		return () => {
			clearInterval(timeUpdateInterval);
		};
	});

	// Load YouTube API
	async function loadYouTubeAPI() {
		return new Promise((resolve, reject) => {
				// Check if API is already loaded
				if (window.YT && window.YT.Player) {
					initializePlayer();
					resolve();
					return;
				}

				// Create hidden player container if it doesn't exist
				if (!document.getElementById('youtube-player')) {
					const playerDiv = document.createElement('div');
					playerDiv.id = 'youtube-player';
					playerDiv.style.position = 'absolute';
					playerDiv.style.top = '-9999px';
					playerDiv.style.left = '-9999px';
					document.body.appendChild(playerDiv);
				}

				// Load the API
				window.onYouTubeIframeAPIReady = () => {
					initializePlayer();
					resolve();
				};

				const tag = document.createElement('script');
				tag.src = 'https://www.youtube.com/iframe_api';

				tag.onerror = () => {
					reject(new Error('Failed to load YouTube API'));
				};

				const firstScriptTag = document.getElementsByTagName('script')[0];
				firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
			});
	}

	// Initialize YouTube Player
	function initializePlayer() {
		console.log('Initializing YouTube player');

		try {
			$$invalidate(0, player = new YT.Player('youtube-player',
			{
					height: '0',
					width: '0',
					videoId: '',
					playerVars: {
						'playsinline': 1,
						'controls': 0,
						'disablekb': 1,
						'rel': 0
					},
					events: {
						'onReady': onPlayerReady,
						'onStateChange': onPlayerStateChange,
						'onError': onPlayerError
					}
				}));
		} catch(error) {
			console.error('Error initializing YouTube player:', error);
		}
	}

	// Player Ready Event Handler
	function onPlayerReady(event) {
		console.log('YouTube player is ready');
		isPlayerReady = true;
		setVolume(volume);

		// Set up media session controls for modern browsers
		if ('mediaSession' in navigator) {
			navigator.mediaSession.setActionHandler('play', togglePlay);
			navigator.mediaSession.setActionHandler('pause', togglePlay);
			navigator.mediaSession.setActionHandler('nexttrack', playNextTrack);
			navigator.mediaSession.setActionHandler('previoustrack', playPreviousTrack);
		}
	}

	// Player State Change Event Handler
	function onPlayerStateChange(event) {
		if (event.data === YT.PlayerState.PLAYING) {
			$$invalidate(1, isPlaying = true);

			if ('mediaSession' in navigator) {
				navigator.mediaSession.playbackState = 'playing';
			}
		} else if (event.data === YT.PlayerState.PAUSED) {
			$$invalidate(1, isPlaying = false);

			if ('mediaSession' in navigator) {
				navigator.mediaSession.playbackState = 'paused';
			}
		} else if (event.data === YT.PlayerState.ENDED) {
			playNextTrack();
		}
	}

	// Player Error Event Handler
	function onPlayerError(event) {
		console.error('YouTube player error:', event.data);
		$$invalidate(1, isPlaying = false);

		// Try to recover by playing next track if possible
		if (playlist.length > 0 && currentTrackIndex >= 0) {
			playNextTrack();
		}
	}

	// Toggle Play/Pause
	function togglePlay() {
		if (!isPlayerReady) {
			console.warn('Player not ready yet. Please wait...');
			return;
		}

		if (isPlaying) {
			player.pauseVideo();
		} else if (currentVideoId) {
			player.playVideo();
		} else if (playlist.length > 0) {
			playVideo(playlist[0].videoId);
		}
	}

	// Play Video with ID
	async function playVideo(videoId) {
		if (!isPlayerReady) {
			console.warn('Player not ready yet. Please wait...');
			return;
		}

		try {
			await player.loadVideoById(videoId);
			currentVideoId = videoId;
			$$invalidate(8, currentTrackIndex = playlist.findIndex(track => track.videoId === videoId));

			// Find track info
			$$invalidate(9, currentTrackInfo = playlist.find(track => track.videoId === videoId) || searchResults.find(result => result.videoId === videoId) || null);

			if (currentTrackInfo) {
				$$invalidate(10, thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);

				// Update media session metadata
				if ('mediaSession' in navigator) {
					navigator.mediaSession.metadata = new MediaMetadata({
							title: currentTrackInfo.title || 'Unknown',
							artist: currentTrackInfo.artist || 'Unknown',
							artwork: [
								{
									src: thumbnailUrl,
									sizes: '480x360',
									type: 'image/jpeg'
								}
							]
						});
				}
			}

			$$invalidate(1, isPlaying = true);
		} catch(error) {
			console.error('Error loading video:', error);
		}
	}

	// Play Next Track
	function playNextTrack() {
		if (playlist.length === 0) return;
		const nextIndex = (currentTrackIndex + 1) % playlist.length;
		playVideo(playlist[nextIndex].videoId);
	}

	// Play Previous Track
	function playPreviousTrack() {
		if (playlist.length === 0) return;

		const prevIndex = currentTrackIndex <= 0
		? playlist.length - 1
		: currentTrackIndex - 1;

		playVideo(playlist[prevIndex].videoId);
	}

	// Set Volume
	function setVolume(value) {
		$$invalidate(4, volume = Math.max(0, Math.min(100, value)));

		if (player && isPlayerReady) {
			player.setVolume(volume);
		}
	}

	// Handle Progress Bar Click
	function handleProgressBarClick(event) {
		if (!isPlayerReady || !duration) return;
		const rect = progressBar.getBoundingClientRect();
		const clickPosition = (event.clientX - rect.left) / rect.width;
		const newTime = clickPosition * duration;
		player.seekTo(newTime, true);
		$$invalidate(2, currentTime = newTime);
	}

	// Search YouTube
	async function searchYouTube() {
		if (!youtubeApiKey) {
			alert('Please enter a YouTube API key first');
			$$invalidate(11, showApiKeyInput = true);
			return;
		}

		if (!searchQuery.trim()) {
			alert('Please enter a search query');
			return;
		}

		try {
			const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&key=${youtubeApiKey}&maxResults=25`);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const data = await response.json();

			searchResults = data.items.map(item => ({
				title: item.snippet.title,
				artist: item.snippet.channelTitle,
				videoId: item.id.videoId,
				thumbnail: item.snippet.thumbnails.default.url
			}));

			// Show search results modal
			showSearchResultsModal();
		} catch(error) {
			console.error('Error fetching YouTube data:', error);
			alert('An error occurred while searching. Please try again.');
			searchResults = [];
		}
	}

	// Show Search Results Modal
	function showSearchResultsModal() {
		// Create modal if it doesn't exist
		let searchModal = document.getElementById('search-results-modal');

		if (!searchModal) {
			searchModal = document.createElement('div');
			searchModal.id = 'search-results-modal';
			searchModal.className = 'modal';
			document.body.appendChild(searchModal);
		}

		// Populate modal
		searchModal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close">×</button>
        <h2>Search Results</h2>
        <div class="search-results">
          ${searchResults.slice(0, displayedResults).map((result, index) => `
            <div class="search-result-item">
              <div class="result-thumbnail">
                <img src="${result.thumbnail}" alt="${result.title}">
              </div>
              <div class="result-info">
                <div class="result-title">${result.title}</div>
                <div class="result-artist">${result.artist}</div>
              </div>
              <div class="result-actions">
                <button class="result-play" data-index="${index}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5V19L19 12L8 5Z"/>
                  </svg>
                </button>
                <button class="result-add" data-index="${index}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
        ${searchResults.length > displayedResults
		? `<button class="load-more-btn">Load More</button>`
		: ''}
      </div>
    `;

		// Show modal
		searchModal.style.display = 'flex';

		// Add event listeners
		const closeBtn = searchModal.querySelector('.modal-close');

		closeBtn.addEventListener('click', () => {
			searchModal.style.display = 'none';
		});

		const playBtns = searchModal.querySelectorAll('.result-play');

		playBtns.forEach(btn => {
			btn.addEventListener('click', () => {
				const index = parseInt(btn.dataset.index);
				playVideo(searchResults[index].videoId);
				searchModal.style.display = 'none';
			});
		});

		const addBtns = searchModal.querySelectorAll('.result-add');

		addBtns.forEach(btn => {
			btn.addEventListener('click', () => {
				const index = parseInt(btn.dataset.index);
				addToPlaylist(searchResults[index]);
			});
		});

		const loadMoreBtn = searchModal.querySelector('.load-more-btn');

		if (loadMoreBtn) {
			loadMoreBtn.addEventListener('click', () => {
				displayedResults += 5;
				showSearchResultsModal();
			});
		}
	}

	// Add to Playlist
	function addToPlaylist(track) {
		$$invalidate(7, playlist = [...playlist, track]);

		// Save to localStorage
		localStorage.setItem('currentPlaylist', JSON.stringify(playlist));
	}

	// Remove from Playlist
	function removeFromPlaylist(index) {
		$$invalidate(7, playlist = playlist.filter((_, i) => i !== index));
		localStorage.setItem('currentPlaylist', JSON.stringify(playlist));

		if (index === currentTrackIndex) {
			if (playlist.length > 0) {
				const newIndex = Math.min(index, playlist.length - 1);
				$$invalidate(8, currentTrackIndex = newIndex);
				playVideo(playlist[newIndex].videoId);
			} else {
				stopPlayback();
			}
		} else if (index < currentTrackIndex) {
			$$invalidate(8, currentTrackIndex--, currentTrackIndex);
		}
	}

	// Stop Playback
	function stopPlayback() {
		if (player && isPlayerReady) {
			player.stopVideo();
		}

		$$invalidate(8, currentTrackIndex = -1);
		currentVideoId = '';
		$$invalidate(1, isPlaying = false);
		$$invalidate(9, currentTrackInfo = null);

		if ('mediaSession' in navigator) {
			navigator.mediaSession.metadata = null;
		}
	}

	// Toggle API Key Input
	function toggleApiKeyInput() {
		$$invalidate(11, showApiKeyInput = !showApiKeyInput);
	}

	// Save API Key
	async function saveApiKey() {
		if (!user) {
			debug('Cannot save API key - user not logged in');
			alert('Please sign in to save your API key');
			return;
		}

		if (!apiKey) {
			debug('Empty API key - not saving');
			alert('Please enter a valid API key');
			return;
		}

		try {
			debug('Saving API key');

			// Check if the api_keys table exists
			const { error: tableCheckError } = await supabase.from('api_keys').select('count').limit(1);

			if (tableCheckError) {
				debug('Table check error - table might not exist', tableCheckError);
				alert('Database error: api_keys table might not exist. Please check your Supabase setup.');
				return;
			}

			const { data, error } = await supabase.from('api_keys').upsert(
				{
					user_id: user.id,
					youtube_api_key: apiKey,
					updated_at: new Date().toISOString()
				},
				{ onConflict: 'user_id' }
			);

			if (error) {
				debug('API key save error', error);
				alert('Failed to save API key: ' + error.message);
				return;
			}

			debug('API key saved successfully');
			apiKeyStored = true;
			initYouTubeAPI();
			alert('API key saved successfully!');
		} catch(e) {
			debug('API key save exception', e);
			alert('Exception saving API key: ' + e.message);
		}
	}

	// Search Lyrics
	function searchLyrics() {
		if (!currentTrackInfo) {
			alert('Please play a track first');
			return;
		}

		// Create lyrics modal
		let lyricsModal = document.getElementById('lyrics-modal');

		if (!lyricsModal) {
			lyricsModal = document.createElement('div');
			lyricsModal.id = 'lyrics-modal';
			lyricsModal.className = 'modal';
			document.body.appendChild(lyricsModal);
		}

		// Populate modal
		lyricsModal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close">×</button>
        <h2>Search Lyrics</h2>
        <div class="lyrics-search">
          <input type="text" class="lyrics-search-input" value="${currentTrackInfo.title} ${currentTrackInfo.artist}" placeholder="Search for lyrics...">
          <button class="lyrics-search-btn">Search</button>
        </div>
        <div class="lyrics-results">
          <p>Enter a search query to find lyrics</p>
        </div>
      </div>
    `;

		// Show modal
		lyricsModal.style.display = 'flex';

		// Add event listeners
		const closeBtn = lyricsModal.querySelector('.modal-close');

		closeBtn.addEventListener('click', () => {
			lyricsModal.style.display = 'none';
		});

		const searchBtn = lyricsModal.querySelector('.lyrics-search-btn');
		const searchInput = lyricsModal.querySelector('.lyrics-search-input');

		searchBtn.addEventListener('click', () => {
			const query = searchInput.value.trim();

			if (query) {
				fetchLyrics(query, lyricsModal);
			}
		});

		searchInput.addEventListener('keydown', e => {
			if (e.key === 'Enter') {
				const query = searchInput.value.trim();

				if (query) {
					fetchLyrics(query, lyricsModal);
				}
			}
		});
	}

	// Save Playlist
	function savePlaylist() {
		if (playlist.length === 0) {
			alert('Your playlist is empty. Add some tracks first!');
			return;
		}

		const playlistName = prompt('Enter a name for your playlist:');
		if (!playlistName) return;

		try {
			const savedPlaylists = JSON.parse(localStorage.getItem('savedPlaylists') || '{}');
			savedPlaylists[playlistName] = playlist;
			localStorage.setItem('savedPlaylists', JSON.stringify(savedPlaylists));
			alert(`Playlist "${playlistName}" saved successfully!`);
		} catch(error) {
			console.error('Error saving playlist:', error);
			alert('Failed to save playlist. Please try again.');
		}
	}

	function input0_input_handler() {
		searchQuery = this.value;
		$$invalidate(5, searchQuery);
	}

	const keydown_handler = e => e.key === 'Enter' && searchYouTube();

	function input_input_handler() {
		youtubeApiKey = this.value;
		$$invalidate(6, youtubeApiKey);
	}

	const keydown_handler_1 = e => e.key === 'Enter' && saveApiKey();

	const keydown_handler_2 = e => handleKeyDown(e, () => {
		
	}); /* Toggle shuffle */

	const keydown_handler_3 = e => handleKeyDown(e, playPreviousTrack);
	const keydown_handler_4 = e => handleKeyDown(e, togglePlay);
	const keydown_handler_5 = e => handleKeyDown(e, playNextTrack);

	const keydown_handler_6 = e => handleKeyDown(e, () => {
		
	}); /* Toggle repeat */

	function div10_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			progressFill = $$value;
			$$invalidate(13, progressFill);
		});
	}

	function div12_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			progressBar = $$value;
			$$invalidate(12, progressBar);
		});
	}

	const keydown_handler_7 = e => {
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			player.seekTo(Math.min(currentTime + 5, duration), true);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			player.seekTo(Math.max(currentTime - 5, 0), true);
		}
	};

	function input1_change_input_handler() {
		volume = to_number(this.value);
		$$invalidate(4, volume);
	}

	const input_handler = () => setVolume(volume);
	const click_handler_2 = index => removeFromPlaylist(index);
	const keydown_handler_8 = (index, e) => handleKeyDown(e, () => removeFromPlaylist(index));
	const click_handler_3 = track => playVideo(track.videoId);
	const keydown_handler_9 = (track, e) => handleKeyDown(e, () => playVideo(track.videoId));

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(27, props = $$props.props);
	};

	return [
		player,
		isPlaying,
		currentTime,
		duration,
		volume,
		searchQuery,
		youtubeApiKey,
		playlist,
		currentTrackIndex,
		currentTrackInfo,
		thumbnailUrl,
		showApiKeyInput,
		progressBar,
		progressFill,
		toggleMute,
		togglePlay,
		playVideo,
		playNextTrack,
		playPreviousTrack,
		setVolume,
		handleProgressBarClick,
		searchYouTube,
		removeFromPlaylist,
		toggleApiKeyInput,
		saveApiKey,
		searchLyrics,
		savePlaylist,
		props,
		input0_input_handler,
		keydown_handler,
		input_input_handler,
		keydown_handler_1,
		keydown_handler_2,
		keydown_handler_3,
		keydown_handler_4,
		keydown_handler_5,
		keydown_handler_6,
		div10_binding,
		div12_binding,
		keydown_handler_7,
		input1_change_input_handler,
		input_handler,
		click_handler_2,
		keydown_handler_8,
		click_handler_3,
		keydown_handler_9
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 27 }, null, [-1, -1, -1]);
	}
}

export { Component as default };
