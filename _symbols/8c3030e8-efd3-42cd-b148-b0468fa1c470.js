// note organizer - Updated July 30, 2025
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
// TODO figure out if we still want to support
// shorthand events, or if we want to implement
// a real bubbling mechanism
function bubble(component, event) {
    const callbacks = component.$$.callbacks[event.type];
    if (callbacks) {
        // @ts-ignore
        callbacks.slice().forEach(fn => fn.call(this, event));
    }
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
	child_ctx[45] = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[48] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[48] = list[i];
	return child_ctx;
}

// (609:16) {#each allTags as tag}
function create_each_block_2(ctx) {
	let button;
	let t0_value = /*tag*/ ctx[48] + "";
	let t0;
	let t1;
	let button_class_value;
	let mounted;
	let dispose;

	function click_handler_4() {
		return /*click_handler_4*/ ctx[27](/*tag*/ ctx[48]);
	}

	function keydown_handler_4(...args) {
		return /*keydown_handler_4*/ ctx[28](/*tag*/ ctx[48], ...args);
	}

	return {
		c() {
			button = element("button");
			t0 = text(t0_value);
			t1 = space();
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t0 = claim_text(button_nodes, t0_value);
			t1 = claim_space(button_nodes);
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button, "class", button_class_value = "tag-filter " + (/*selectedTag*/ ctx[1] === /*tag*/ ctx[48]
			? 'active'
			: '') + " svelte-1iorv8v");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, t0);
			append_hydration(button, t1);

			if (!mounted) {
				dispose = [
					listen(button, "click", click_handler_4),
					listen(button, "keydown", keydown_handler_4)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty[0] & /*allTags*/ 128 && t0_value !== (t0_value = /*tag*/ ctx[48] + "")) set_data(t0, t0_value);

			if (dirty[0] & /*selectedTag, allTags*/ 130 && button_class_value !== (button_class_value = "tag-filter " + (/*selectedTag*/ ctx[1] === /*tag*/ ctx[48]
			? 'active'
			: '') + " svelte-1iorv8v")) {
				attr(button, "class", button_class_value);
			}
		},
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (626:8) {:else}
function create_else_block(ctx) {
	let div;
	let each_value = /*filteredNotes*/ ctx[6];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div_nodes);
			}

			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "notes-grid svelte-1iorv8v");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*editNote, filteredNotes*/ 4160) {
				each_value = /*filteredNotes*/ ctx[6];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (620:8) {#if filteredNotes.length === 0}
function create_if_block_2(ctx) {
	let div1;
	let div0;
	let t0;
	let t1;
	let h3;
	let t2;
	let t3;
	let p;
	let t4;

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			t0 = text("📝");
			t1 = space();
			h3 = element("h3");
			t2 = text("No notes found");
			t3 = space();
			p = element("p");
			t4 = text("Create your first note by clicking the + button");
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, "📝");
			div0_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			h3 = claim_element(div1_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t2 = claim_text(h3_nodes, "No notes found");
			h3_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t4 = claim_text(p_nodes, "Create your first note by clicking the + button");
			p_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "empty-state-icon svelte-1iorv8v");
			attr(h3, "class", "svelte-1iorv8v");
			attr(p, "class", "svelte-1iorv8v");
			attr(div1, "class", "empty-state svelte-1iorv8v");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, t0);
			append_hydration(div1, t1);
			append_hydration(div1, h3);
			append_hydration(h3, t2);
			append_hydration(div1, t3);
			append_hydration(div1, p);
			append_hydration(p, t4);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div1);
		}
	};
}

// (634:28) {#each note.tags as tag}
function create_each_block_1(ctx) {
	let span;
	let t_value = /*tag*/ ctx[48] + "";
	let t;

	return {
		c() {
			span = element("span");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			span = claim_element(nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t = claim_text(span_nodes, t_value);
			span_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "note-tag svelte-1iorv8v");
		},
		m(target, anchor) {
			insert_hydration(target, span, anchor);
			append_hydration(span, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*filteredNotes*/ 64 && t_value !== (t_value = /*tag*/ ctx[48] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(span);
		}
	};
}

// (628:16) {#each filteredNotes as note}
function create_each_block(ctx) {
	let div2;
	let h3;
	let t0_value = /*note*/ ctx[45].title + "";
	let t0;
	let t1;
	let p;
	let t2_value = /*note*/ ctx[45].text + "";
	let t2;
	let t3;
	let div0;
	let t4;
	let div1;
	let span0;
	let t5;
	let t6_value = formatDate(/*note*/ ctx[45].dateCreated) + "";
	let t6;
	let t7;
	let span1;
	let t8;
	let t9_value = formatDate(/*note*/ ctx[45].dateModified) + "";
	let t9;
	let t10;
	let mounted;
	let dispose;
	let each_value_1 = /*note*/ ctx[45].tags;
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	function click_handler_5() {
		return /*click_handler_5*/ ctx[29](/*note*/ ctx[45]);
	}

	function keydown_handler_5(...args) {
		return /*keydown_handler_5*/ ctx[30](/*note*/ ctx[45], ...args);
	}

	return {
		c() {
			div2 = element("div");
			h3 = element("h3");
			t0 = text(t0_value);
			t1 = space();
			p = element("p");
			t2 = text(t2_value);
			t3 = space();
			div0 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t4 = space();
			div1 = element("div");
			span0 = element("span");
			t5 = text("Created: ");
			t6 = text(t6_value);
			t7 = space();
			span1 = element("span");
			t8 = text("Modified: ");
			t9 = text(t9_value);
			t10 = space();
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true, tabindex: true });
			var div2_nodes = children(div2);
			h3 = claim_element(div2_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, t0_value);
			h3_nodes.forEach(detach);
			t1 = claim_space(div2_nodes);
			p = claim_element(div2_nodes, "P", { class: true });
			var p_nodes = children(p);
			t2 = claim_text(p_nodes, t2_value);
			p_nodes.forEach(detach);
			t3 = claim_space(div2_nodes);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div0_nodes);
			}

			div0_nodes.forEach(detach);
			t4 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			span0 = claim_element(div1_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t5 = claim_text(span0_nodes, "Created: ");
			t6 = claim_text(span0_nodes, t6_value);
			span0_nodes.forEach(detach);
			t7 = claim_space(div1_nodes);
			span1 = claim_element(div1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t8 = claim_text(span1_nodes, "Modified: ");
			t9 = claim_text(span1_nodes, t9_value);
			span1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t10 = claim_space(div2_nodes);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "note-title svelte-1iorv8v");
			attr(p, "class", "note-text svelte-1iorv8v");
			attr(div0, "class", "note-tags svelte-1iorv8v");
			attr(span0, "class", "svelte-1iorv8v");
			attr(span1, "class", "svelte-1iorv8v");
			attr(div1, "class", "note-meta svelte-1iorv8v");
			attr(div2, "class", "note-card svelte-1iorv8v");
			attr(div2, "tabindex", "0");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, h3);
			append_hydration(h3, t0);
			append_hydration(div2, t1);
			append_hydration(div2, p);
			append_hydration(p, t2);
			append_hydration(div2, t3);
			append_hydration(div2, div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div0, null);
				}
			}

			append_hydration(div2, t4);
			append_hydration(div2, div1);
			append_hydration(div1, span0);
			append_hydration(span0, t5);
			append_hydration(span0, t6);
			append_hydration(div1, t7);
			append_hydration(div1, span1);
			append_hydration(span1, t8);
			append_hydration(span1, t9);
			append_hydration(div2, t10);

			if (!mounted) {
				dispose = [
					listen(div2, "click", click_handler_5),
					listen(div2, "keydown", keydown_handler_5)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty[0] & /*filteredNotes*/ 64 && t0_value !== (t0_value = /*note*/ ctx[45].title + "")) set_data(t0, t0_value);
			if (dirty[0] & /*filteredNotes*/ 64 && t2_value !== (t2_value = /*note*/ ctx[45].text + "")) set_data(t2, t2_value);

			if (dirty[0] & /*filteredNotes*/ 64) {
				each_value_1 = /*note*/ ctx[45].tags;
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div0, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_1.length;
			}

			if (dirty[0] & /*filteredNotes*/ 64 && t6_value !== (t6_value = formatDate(/*note*/ ctx[45].dateCreated) + "")) set_data(t6, t6_value);
			if (dirty[0] & /*filteredNotes*/ 64 && t9_value !== (t9_value = formatDate(/*note*/ ctx[45].dateModified) + "")) set_data(t9, t9_value);
		},
		d(detaching) {
			if (detaching) detach(div2);
			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (647:8) {#if showModal}
function create_if_block(ctx) {
	let div6;
	let div5;
	let div0;
	let h2;
	let t0_value = (/*editingNote*/ ctx[4] ? 'Edit Note' : 'Add Note') + "";
	let t0;
	let t1;
	let button0;
	let t2;
	let t3;
	let div1;
	let label0;
	let t4;
	let t5;
	let input0;
	let t6;
	let div2;
	let label1;
	let t7;
	let t8;
	let input1;
	let t9;
	let div3;
	let label2;
	let t10;
	let t11;
	let textarea;
	let t12;
	let div4;
	let t13;
	let button1;
	let t14;
	let t15;
	let button2;
	let t16_value = (/*editingNote*/ ctx[4] ? 'Update' : 'Save') + "";
	let t16;
	let mounted;
	let dispose;
	let if_block = /*editingNote*/ ctx[4] && create_if_block_1(ctx);

	return {
		c() {
			div6 = element("div");
			div5 = element("div");
			div0 = element("div");
			h2 = element("h2");
			t0 = text(t0_value);
			t1 = space();
			button0 = element("button");
			t2 = text("×");
			t3 = space();
			div1 = element("div");
			label0 = element("label");
			t4 = text("Title");
			t5 = space();
			input0 = element("input");
			t6 = space();
			div2 = element("div");
			label1 = element("label");
			t7 = text("Tags (comma separated)");
			t8 = space();
			input1 = element("input");
			t9 = space();
			div3 = element("div");
			label2 = element("label");
			t10 = text("Note");
			t11 = space();
			textarea = element("textarea");
			t12 = space();
			div4 = element("div");
			if (if_block) if_block.c();
			t13 = space();
			button1 = element("button");
			t14 = text("Cancel");
			t15 = space();
			button2 = element("button");
			t16 = text(t16_value);
			this.h();
		},
		l(nodes) {
			div6 = claim_element(nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			div5 = claim_element(div6_nodes, "DIV", { class: true, tabindex: true });
			var div5_nodes = children(div5);
			div0 = claim_element(div5_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h2 = claim_element(div0_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, t0_value);
			h2_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t2 = claim_text(button0_nodes, "×");
			button0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(div5_nodes);
			div1 = claim_element(div5_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			label0 = claim_element(div1_nodes, "LABEL", { for: true, class: true });
			var label0_nodes = children(label0);
			t4 = claim_text(label0_nodes, "Title");
			label0_nodes.forEach(detach);
			t5 = claim_space(div1_nodes);

			input0 = claim_element(div1_nodes, "INPUT", {
				type: true,
				id: true,
				class: true,
				placeholder: true
			});

			div1_nodes.forEach(detach);
			t6 = claim_space(div5_nodes);
			div2 = claim_element(div5_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			label1 = claim_element(div2_nodes, "LABEL", { for: true, class: true });
			var label1_nodes = children(label1);
			t7 = claim_text(label1_nodes, "Tags (comma separated)");
			label1_nodes.forEach(detach);
			t8 = claim_space(div2_nodes);

			input1 = claim_element(div2_nodes, "INPUT", {
				type: true,
				id: true,
				class: true,
				placeholder: true
			});

			div2_nodes.forEach(detach);
			t9 = claim_space(div5_nodes);
			div3 = claim_element(div5_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			label2 = claim_element(div3_nodes, "LABEL", { for: true, class: true });
			var label2_nodes = children(label2);
			t10 = claim_text(label2_nodes, "Note");
			label2_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);
			textarea = claim_element(div3_nodes, "TEXTAREA", { id: true, class: true, placeholder: true });
			children(textarea).forEach(detach);
			div3_nodes.forEach(detach);
			t12 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			if (if_block) if_block.l(div4_nodes);
			t13 = claim_space(div4_nodes);
			button1 = claim_element(div4_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t14 = claim_text(button1_nodes, "Cancel");
			button1_nodes.forEach(detach);
			t15 = claim_space(div4_nodes);
			button2 = claim_element(div4_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t16 = claim_text(button2_nodes, t16_value);
			button2_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "modal-title svelte-1iorv8v");
			attr(button0, "class", "close-btn svelte-1iorv8v");
			attr(div0, "class", "modal-header svelte-1iorv8v");
			attr(label0, "for", "note-title");
			attr(label0, "class", "form-label svelte-1iorv8v");
			attr(input0, "type", "text");
			attr(input0, "id", "note-title");
			attr(input0, "class", "form-input svelte-1iorv8v");
			attr(input0, "placeholder", "Enter note title...");
			attr(div1, "class", "form-group svelte-1iorv8v");
			attr(label1, "for", "note-tags");
			attr(label1, "class", "form-label svelte-1iorv8v");
			attr(input1, "type", "text");
			attr(input1, "id", "note-tags");
			attr(input1, "class", "form-input svelte-1iorv8v");
			attr(input1, "placeholder", "work, personal, ideas...");
			attr(div2, "class", "form-group svelte-1iorv8v");
			attr(label2, "for", "note-text");
			attr(label2, "class", "form-label svelte-1iorv8v");
			attr(textarea, "id", "note-text");
			attr(textarea, "class", "form-textarea svelte-1iorv8v");
			attr(textarea, "placeholder", "Write your note here...");
			attr(div3, "class", "form-group svelte-1iorv8v");
			attr(button1, "class", "btn btn-secondary svelte-1iorv8v");
			attr(button2, "class", "btn btn-primary svelte-1iorv8v");
			attr(div4, "class", "modal-actions svelte-1iorv8v");
			attr(div5, "class", "modal-content svelte-1iorv8v");
			attr(div5, "tabindex", "-1");
			attr(div6, "class", "modal svelte-1iorv8v");
		},
		m(target, anchor) {
			insert_hydration(target, div6, anchor);
			append_hydration(div6, div5);
			append_hydration(div5, div0);
			append_hydration(div0, h2);
			append_hydration(h2, t0);
			append_hydration(div0, t1);
			append_hydration(div0, button0);
			append_hydration(button0, t2);
			append_hydration(div5, t3);
			append_hydration(div5, div1);
			append_hydration(div1, label0);
			append_hydration(label0, t4);
			append_hydration(div1, t5);
			append_hydration(div1, input0);
			set_input_value(input0, /*formData*/ ctx[5].title);
			append_hydration(div5, t6);
			append_hydration(div5, div2);
			append_hydration(div2, label1);
			append_hydration(label1, t7);
			append_hydration(div2, t8);
			append_hydration(div2, input1);
			set_input_value(input1, /*formData*/ ctx[5].tagsString);
			append_hydration(div5, t9);
			append_hydration(div5, div3);
			append_hydration(div3, label2);
			append_hydration(label2, t10);
			append_hydration(div3, t11);
			append_hydration(div3, textarea);
			set_input_value(textarea, /*formData*/ ctx[5].text);
			append_hydration(div5, t12);
			append_hydration(div5, div4);
			if (if_block) if_block.m(div4, null);
			append_hydration(div4, t13);
			append_hydration(div4, button1);
			append_hydration(button1, t14);
			append_hydration(div4, t15);
			append_hydration(div4, button2);
			append_hydration(button2, t16);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*closeModal*/ ctx[13]),
					listen(button0, "keydown", /*keydown_handler_7*/ ctx[32]),
					listen(input0, "input", /*input0_input_handler*/ ctx[33]),
					listen(input1, "input", /*input1_input_handler*/ ctx[34]),
					listen(textarea, "input", /*textarea_input_handler*/ ctx[35]),
					listen(button1, "click", /*closeModal*/ ctx[13]),
					listen(button1, "keydown", /*keydown_handler_9*/ ctx[37]),
					listen(button2, "click", /*saveNote*/ ctx[14]),
					listen(button2, "keydown", /*keydown_handler_10*/ ctx[38]),
					listen(div5, "click", stop_propagation(/*click_handler*/ ctx[18])),
					listen(div5, "keydown", /*keydown_handler_11*/ ctx[39]),
					listen(div6, "click", /*closeModal*/ ctx[13]),
					listen(div6, "keydown", /*keydown_handler_12*/ ctx[40])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*editingNote*/ 16 && t0_value !== (t0_value = (/*editingNote*/ ctx[4] ? 'Edit Note' : 'Add Note') + "")) set_data(t0, t0_value);

			if (dirty[0] & /*formData*/ 32 && input0.value !== /*formData*/ ctx[5].title) {
				set_input_value(input0, /*formData*/ ctx[5].title);
			}

			if (dirty[0] & /*formData*/ 32 && input1.value !== /*formData*/ ctx[5].tagsString) {
				set_input_value(input1, /*formData*/ ctx[5].tagsString);
			}

			if (dirty[0] & /*formData*/ 32) {
				set_input_value(textarea, /*formData*/ ctx[5].text);
			}

			if (/*editingNote*/ ctx[4]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_1(ctx);
					if_block.c();
					if_block.m(div4, t13);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}

			if (dirty[0] & /*editingNote*/ 16 && t16_value !== (t16_value = (/*editingNote*/ ctx[4] ? 'Update' : 'Save') + "")) set_data(t16, t16_value);
		},
		d(detaching) {
			if (detaching) detach(div6);
			if (if_block) if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (684:24) {#if editingNote}
function create_if_block_1(ctx) {
	let button;
	let t;
	let mounted;
	let dispose;

	return {
		c() {
			button = element("button");
			t = text("Delete");
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t = claim_text(button_nodes, "Delete");
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button, "class", "btn btn-danger svelte-1iorv8v");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, t);

			if (!mounted) {
				dispose = [
					listen(button, "click", /*deleteNote*/ ctx[15]),
					listen(button, "keydown", /*keydown_handler_8*/ ctx[36])
				];

				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let div5;
	let div1;
	let h1;
	let t0;
	let t1;
	let div0;
	let input;
	let t2;
	let svg;
	let path;
	let t3;
	let div4;
	let div2;
	let button0;
	let t4;
	let button0_class_value;
	let t5;
	let button1;
	let t6;
	let button1_class_value;
	let t7;
	let div3;
	let button2;
	let t8;
	let button2_class_value;
	let t9;
	let t10;
	let t11;
	let button3;
	let t12;
	let t13;
	let mounted;
	let dispose;
	let each_value_2 = /*allTags*/ ctx[7];
	let each_blocks = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	function select_block_type(ctx, dirty) {
		if (/*filteredNotes*/ ctx[6].length === 0) return create_if_block_2;
		return create_else_block;
	}

	let current_block_type = select_block_type(ctx);
	let if_block0 = current_block_type(ctx);
	let if_block1 = /*showModal*/ ctx[3] && create_if_block(ctx);

	return {
		c() {
			div5 = element("div");
			div1 = element("div");
			h1 = element("h1");
			t0 = text("Note Organizer");
			t1 = space();
			div0 = element("div");
			input = element("input");
			t2 = space();
			svg = svg_element("svg");
			path = svg_element("path");
			t3 = space();
			div4 = element("div");
			div2 = element("div");
			button0 = element("button");
			t4 = text("Date Created");
			t5 = space();
			button1 = element("button");
			t6 = text("Date Modified");
			t7 = space();
			div3 = element("div");
			button2 = element("button");
			t8 = text("All");
			t9 = space();

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t10 = space();
			if_block0.c();
			t11 = space();
			button3 = element("button");
			t12 = text("+");
			t13 = space();
			if (if_block1) if_block1.c();
			this.h();
		},
		l(nodes) {
			div5 = claim_element(nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div1 = claim_element(div5_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h1 = claim_element(div1_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Note Organizer");
			h1_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			input = claim_element(div0_nodes, "INPUT", {
				type: true,
				class: true,
				placeholder: true
			});

			t2 = claim_space(div0_nodes);

			svg = claim_svg_element(div0_nodes, "svg", {
				class: true,
				fill: true,
				stroke: true,
				viewBox: true
			});

			var svg_nodes = children(svg);

			path = claim_svg_element(svg_nodes, "path", {
				"stroke-linecap": true,
				"stroke-linejoin": true,
				"stroke-width": true,
				d: true,
				class: true
			});

			children(path).forEach(detach);
			svg_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t3 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div2 = claim_element(div4_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			button0 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t4 = claim_text(button0_nodes, "Date Created");
			button0_nodes.forEach(detach);
			t5 = claim_space(div2_nodes);
			button1 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t6 = claim_text(button1_nodes, "Date Modified");
			button1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t7 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			button2 = claim_element(div3_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t8 = claim_text(button2_nodes, "All");
			button2_nodes.forEach(detach);
			t9 = claim_space(div3_nodes);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div3_nodes);
			}

			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t10 = claim_space(div5_nodes);
			if_block0.l(div5_nodes);
			t11 = claim_space(div5_nodes);
			button3 = claim_element(div5_nodes, "BUTTON", { class: true });
			var button3_nodes = children(button3);
			t12 = claim_text(button3_nodes, "+");
			button3_nodes.forEach(detach);
			t13 = claim_space(div5_nodes);
			if (if_block1) if_block1.l(div5_nodes);
			div5_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "title svelte-1iorv8v");
			attr(input, "type", "text");
			attr(input, "class", "search-input svelte-1iorv8v");
			attr(input, "placeholder", "Search notes...");
			attr(path, "stroke-linecap", "round");
			attr(path, "stroke-linejoin", "round");
			attr(path, "stroke-width", "2");
			attr(path, "d", "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z");
			attr(path, "class", "svelte-1iorv8v");
			attr(svg, "class", "search-icon svelte-1iorv8v");
			attr(svg, "fill", "none");
			attr(svg, "stroke", "currentColor");
			attr(svg, "viewBox", "0 0 24 24");
			attr(div0, "class", "search-container svelte-1iorv8v");
			attr(div1, "class", "header svelte-1iorv8v");
			attr(button0, "class", button0_class_value = "sort-btn " + (/*sortBy*/ ctx[2] === 'dateCreated' ? 'active' : '') + " svelte-1iorv8v");
			attr(button1, "class", button1_class_value = "sort-btn " + (/*sortBy*/ ctx[2] === 'dateModified' ? 'active' : '') + " svelte-1iorv8v");
			attr(div2, "class", "sort-controls svelte-1iorv8v");
			attr(button2, "class", button2_class_value = "tag-filter " + (/*selectedTag*/ ctx[1] === '' ? 'active' : '') + " svelte-1iorv8v");
			attr(div3, "class", "tags-filter svelte-1iorv8v");
			attr(div4, "class", "filters svelte-1iorv8v");
			attr(button3, "class", "add-btn svelte-1iorv8v");
			attr(div5, "class", "container svelte-1iorv8v");
		},
		m(target, anchor) {
			insert_hydration(target, div5, anchor);
			append_hydration(div5, div1);
			append_hydration(div1, h1);
			append_hydration(h1, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, input);
			set_input_value(input, /*searchQuery*/ ctx[0]);
			append_hydration(div0, t2);
			append_hydration(div0, svg);
			append_hydration(svg, path);
			append_hydration(div5, t3);
			append_hydration(div5, div4);
			append_hydration(div4, div2);
			append_hydration(div2, button0);
			append_hydration(button0, t4);
			append_hydration(div2, t5);
			append_hydration(div2, button1);
			append_hydration(button1, t6);
			append_hydration(div4, t7);
			append_hydration(div4, div3);
			append_hydration(div3, button2);
			append_hydration(button2, t8);
			append_hydration(div3, t9);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div3, null);
				}
			}

			append_hydration(div5, t10);
			if_block0.m(div5, null);
			append_hydration(div5, t11);
			append_hydration(div5, button3);
			append_hydration(button3, t12);
			append_hydration(div5, t13);
			if (if_block1) if_block1.m(div5, null);

			if (!mounted) {
				dispose = [
					listen(input, "input", /*input_input_handler*/ ctx[19]),
					listen(input, "input", /*handleSearch*/ ctx[8]),
					listen(input, "keydown", /*keydown_handler*/ ctx[20]),
					listen(button0, "click", /*click_handler_1*/ ctx[21]),
					listen(button0, "keydown", /*keydown_handler_1*/ ctx[22]),
					listen(button1, "click", /*click_handler_2*/ ctx[23]),
					listen(button1, "keydown", /*keydown_handler_2*/ ctx[24]),
					listen(button2, "click", /*click_handler_3*/ ctx[25]),
					listen(button2, "keydown", /*keydown_handler_3*/ ctx[26]),
					listen(button3, "click", /*openAddModal*/ ctx[11]),
					listen(button3, "keydown", /*keydown_handler_6*/ ctx[31])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*searchQuery*/ 1 && input.value !== /*searchQuery*/ ctx[0]) {
				set_input_value(input, /*searchQuery*/ ctx[0]);
			}

			if (dirty[0] & /*sortBy*/ 4 && button0_class_value !== (button0_class_value = "sort-btn " + (/*sortBy*/ ctx[2] === 'dateCreated' ? 'active' : '') + " svelte-1iorv8v")) {
				attr(button0, "class", button0_class_value);
			}

			if (dirty[0] & /*sortBy*/ 4 && button1_class_value !== (button1_class_value = "sort-btn " + (/*sortBy*/ ctx[2] === 'dateModified' ? 'active' : '') + " svelte-1iorv8v")) {
				attr(button1, "class", button1_class_value);
			}

			if (dirty[0] & /*selectedTag*/ 2 && button2_class_value !== (button2_class_value = "tag-filter " + (/*selectedTag*/ ctx[1] === '' ? 'active' : '') + " svelte-1iorv8v")) {
				attr(button2, "class", button2_class_value);
			}

			if (dirty[0] & /*selectedTag, allTags, setSelectedTag*/ 1154) {
				each_value_2 = /*allTags*/ ctx[7];
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_2(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div3, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_2.length;
			}

			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
				if_block0.p(ctx, dirty);
			} else {
				if_block0.d(1);
				if_block0 = current_block_type(ctx);

				if (if_block0) {
					if_block0.c();
					if_block0.m(div5, t11);
				}
			}

			if (/*showModal*/ ctx[3]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					if_block1.m(div5, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div5);
			destroy_each(each_blocks, detaching);
			if_block0.d();
			if (if_block1) if_block1.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateString) {
	const date = new Date(dateString);

	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function parseTags(tagsString) {
	return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
}

function instance($$self, $$props, $$invalidate) {
	let allTags;
	let filteredNotes;
	let { props } = $$props;

	// State variables
	let notes = [];

	let searchQuery = '';
	let selectedTag = '';
	let sortBy = 'dateModified';
	let showModal = false;
	let editingNote = null;
	let formData = { title: '', text: '', tagsString: '' };

	// Initialize app
	function init() {
		loadNotes();

		if (notes.length === 0) {
			createExampleNotes();
		}
	}

	// Create example notes on first load
	function createExampleNotes() {
		const exampleNotes = [
			{
				id: generateId(),
				title: 'Welcome to Note Organizer',
				text: 'This is your first note! You can create, edit, and organize notes with tags. Use the search bar to find notes quickly and filter by tags.',
				tags: ['welcome', 'tutorial'],
				dateCreated: new Date().toISOString(),
				dateModified: new Date().toISOString()
			},
			{
				id: generateId(),
				title: 'Project Ideas',
				text: 'List of project ideas:\n- Build a personal website\n- Learn a new programming language\n- Create a mobile app\n- Write a blog about coding',
				tags: ['work', 'ideas', 'projects'],
				dateCreated: new Date(Date.now() - 86400000).toISOString(), // Yesterday
				dateModified: new Date(Date.now() - 86400000).toISOString()
			},
			{
				id: generateId(),
				title: 'Shopping List',
				text: 'Weekly groceries:\n- Milk\n- Bread\n- Eggs\n- Fruits\n- Vegetables\n- Coffee',
				tags: ['personal', 'shopping'],
				dateCreated: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
				dateModified: new Date(Date.now() - 172800000).toISOString()
			}
		];

		$$invalidate(17, notes = exampleNotes);
		saveNotes();
	}

	// Local storage functions
	function loadNotes() {
		const stored = localStorage.getItem('notes');

		if (stored) {
			$$invalidate(17, notes = JSON.parse(stored));
		}
	}

	function saveNotes() {
		localStorage.setItem('notes', JSON.stringify(notes));
	}

	// Event handlers
	function handleSearch(event) {
		$$invalidate(0, searchQuery = event.target.value);
	}

	function setSortBy(newSortBy) {
		$$invalidate(2, sortBy = newSortBy);
	}

	function setSelectedTag(tag) {
		$$invalidate(1, selectedTag = tag);
	}

	function openAddModal() {
		$$invalidate(4, editingNote = null);
		$$invalidate(5, formData = { title: '', text: '', tagsString: '' });
		$$invalidate(3, showModal = true);
	}

	function editNote(note) {
		$$invalidate(4, editingNote = note);

		$$invalidate(5, formData = {
			title: note.title,
			text: note.text,
			tagsString: note.tags.join(', ')
		});

		$$invalidate(3, showModal = true);
	}

	function closeModal() {
		$$invalidate(3, showModal = false);
		$$invalidate(4, editingNote = null);
	}

	function saveNote() {
		if (!formData.title.trim()) {
			alert('Please enter a title');
			return;
		}

		const tags = parseTags(formData.tagsString);
		const now = new Date().toISOString();

		if (editingNote) {
			// Update existing note
			const index = notes.findIndex(n => n.id === editingNote.id);

			$$invalidate(
				17,
				notes[index] = {
					...editingNote,
					title: formData.title.trim(),
					text: formData.text.trim(),
					tags,
					dateModified: now
				},
				notes
			);
		} else {
			// Create new note
			const newNote = {
				id: generateId(),
				title: formData.title.trim(),
				text: formData.text.trim(),
				tags,
				dateCreated: now,
				dateModified: now
			};

			$$invalidate(17, notes = [newNote, ...notes]);
		}

		saveNotes();
		closeModal();
	}

	function deleteNote() {
		if (confirm('Are you sure you want to delete this note?')) {
			$$invalidate(17, notes = notes.filter(n => n.id !== editingNote.id));
			saveNotes();
			closeModal();
		}
	}

	// Initialize the app
	init();

	function click_handler(event) {
		bubble.call(this, $$self, event);
	}

	function input_input_handler() {
		searchQuery = this.value;
		$$invalidate(0, searchQuery);
	}

	const keydown_handler = e => {
		if (e.key === 'Enter') handleSearch(e);
	};

	const click_handler_1 = () => setSortBy('dateCreated');

	const keydown_handler_1 = e => {
		if (e.key === 'Enter' || e.key === ' ') setSortBy('dateCreated');
	};

	const click_handler_2 = () => setSortBy('dateModified');

	const keydown_handler_2 = e => {
		if (e.key === 'Enter' || e.key === ' ') setSortBy('dateModified');
	};

	const click_handler_3 = () => setSelectedTag('');

	const keydown_handler_3 = e => {
		if (e.key === 'Enter' || e.key === ' ') setSelectedTag('');
	};

	const click_handler_4 = tag => setSelectedTag(tag);

	const keydown_handler_4 = (tag, e) => {
		if (e.key === 'Enter' || e.key === ' ') setSelectedTag(tag);
	};

	const click_handler_5 = note => editNote(note);

	const keydown_handler_5 = (note, e) => {
		if (e.key === 'Enter' || e.key === ' ') editNote(note);
	};

	const keydown_handler_6 = e => {
		if (e.key === 'Enter' || e.key === ' ') openAddModal();
	};

	const keydown_handler_7 = e => {
		if (e.key === 'Enter' || e.key === ' ') closeModal();
	};

	function input0_input_handler() {
		formData.title = this.value;
		$$invalidate(5, formData);
	}

	function input1_input_handler() {
		formData.tagsString = this.value;
		$$invalidate(5, formData);
	}

	function textarea_input_handler() {
		formData.text = this.value;
		$$invalidate(5, formData);
	}

	const keydown_handler_8 = e => {
		if (e.key === 'Enter' || e.key === ' ') deleteNote();
	};

	const keydown_handler_9 = e => {
		if (e.key === 'Enter' || e.key === ' ') closeModal();
	};

	const keydown_handler_10 = e => {
		if (e.key === 'Enter' || e.key === ' ') saveNote();
	};

	const keydown_handler_11 = e => {
		if (e.key === 'Escape') closeModal();
	};

	const keydown_handler_12 = e => {
		if (e.key === 'Escape') closeModal();
	};

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(16, props = $$props.props);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*notes*/ 131072) {
			// Computed properties
			$$invalidate(7, allTags = [...new Set(notes.flatMap(note => note.tags))].sort());
		}

		if ($$self.$$.dirty[0] & /*notes, searchQuery, selectedTag, sortBy*/ 131079) {
			$$invalidate(6, filteredNotes = notes.filter(note => {
				const matchesSearch = !searchQuery || note.title.toLowerCase().includes(searchQuery.toLowerCase()) || note.text.toLowerCase().includes(searchQuery.toLowerCase()) || note.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
				const matchesTag = !selectedTag || note.tags.includes(selectedTag);
				return matchesSearch && matchesTag;
			}).sort((a, b) => {
				const dateA = new Date(a[sortBy]);
				const dateB = new Date(b[sortBy]);
				return dateB - dateA; // Most recent first
			}));
		}
	};

	return [
		searchQuery,
		selectedTag,
		sortBy,
		showModal,
		editingNote,
		formData,
		filteredNotes,
		allTags,
		handleSearch,
		setSortBy,
		setSelectedTag,
		openAddModal,
		editNote,
		closeModal,
		saveNote,
		deleteNote,
		props,
		notes,
		click_handler,
		input_input_handler,
		keydown_handler,
		click_handler_1,
		keydown_handler_1,
		click_handler_2,
		keydown_handler_2,
		click_handler_3,
		keydown_handler_3,
		click_handler_4,
		keydown_handler_4,
		click_handler_5,
		keydown_handler_5,
		keydown_handler_6,
		keydown_handler_7,
		input0_input_handler,
		input1_input_handler,
		textarea_input_handler,
		keydown_handler_8,
		keydown_handler_9,
		keydown_handler_10,
		keydown_handler_11,
		keydown_handler_12
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 16 }, null, [-1, -1]);
	}
}

export { Component as default };
