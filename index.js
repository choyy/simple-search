const siyuan = require("siyuan");

const sql_default_order_by = "order by case type \
 when 'd' then 1\
 when 'h' then 2\
 when 'i' then 3\
 when 'p' then 4\
 when 't' then 5\
 when 'b' then 6\
 when 'c' then 7\
 when 'm' then 8\
 when 'l' then 9\
 when 's' then 10\
 when 'html' then 11\
 when 'widget' then 12\
 when 'query_embed' then 13\
 when 'iframe' then 14\
 end, updated desc";
const type_mapping = { // 定义思源块类型映射关系
    audioBlock: '',
    blockquote: 'b',
    codeBlock: 'c',
    databaseBlock: '',
    document: 'd',
    embedBlock: '',
    heading: 'h',
    htmlBlock: '',
    iframeBlock: '',
    list: 'l',
    listItem: 'i',
    mathBlock: 'm',
    paragraph: 'p',
    superBlock: 's',
    table: 't',
    videoBlock: '',
    widgetBlock: ''
};
const search_method_mapping = {
    "-w": 0, // 关键字搜索
    "-q": 1, // 查询语法搜索
    "-s": 2, // SQL搜索
    "-r": 3  // 正则表达式搜索
};

let g_keywords = [], g_search_group = window.siyuan.storage["local-searchdata"].group; // 全局变量，保存搜索关键词和分组方式
function parseInputItems(search_keywords) {
    let input_text_items   = search_keywords.split(" ");
    let key_words          = []; // 搜索关键词
    let excluded_key_words = []; // 排除的关键词
    let options            = ""; // 搜索选项
    
    for (let i = 0; i < input_text_items.length; i++) {
        if (input_text_items[i] == "" || input_text_items[i] == "-") {
            continue;
        } else if (input_text_items[i].match(/^-[kKDedhlptbsicmoOL1-6]+$/) != null) {
            options += input_text_items[i].slice(1);
        }
        else if (input_text_items[i].match(/^-.+/) != null) {
            excluded_key_words.push(input_text_items[i].slice(1));
        }
        else {
            key_words.push(input_text_items[i]);
        }
    }
    
    return {
        key_words: key_words,
        excluded_key_words: excluded_key_words,
        options: options
    };
}
function transferSqlKeyWords(key_words, excluded_key_words, field = "content") {
    let conditions = [];
    for (let keyword of key_words) {
        conditions.push(`${field} like '%${keyword}%'`);
    }
    for (let keyword of excluded_key_words) {
        conditions.push(`${field} not like '%${keyword}%'`);
    }
    return conditions.length > 0 ? `(${conditions.join(' and ')}) ` : "true ";
}
function transferSqlTypes(options) {
    let sql_type_rlike = ""; // sql筛选块的语句
    const type_handler = {   // 这里使用REGEXP而不是rlike，因为递归查询不支持rlike
        // 搜索标准块类型的sql语句，标题单独处理
        "[dlptbsicm]": (types) => `type REGEXP '^[${types.replace(/[^dlptbsicm]/g, "")}]$' `,
        // 搜索标题和子标题的sql语句
        "h[1-6]?": (types) => {
            return types.match(/h[1-6]/) ? `subtype REGEXP '^h[${types.replace(/[^\d]/g, "")}]$' `
                                         : `type REGEXP '^h$' `
        },
        // 搜索待办的sql语句
        "[oO]": (types) => {
            let todoType = !types.includes('O') ? "and markdown like '%[ ] %'" // o：仅搜索未完成待办
                         : !types.includes('o') ? "and markdown like '%[x] %'" // O：仅搜索已完成待办
                         : "and (markdown like '%[ ] %' or markdown like '%[x] %')"; // oO：搜索所有待办
            return `(subtype like 't' and type not like 'l' ${todoType}) `;
        },
        // 搜索带链接的块的sql语句
        "[L]": () => `(type REGEXP '^[htp]$' and markdown like '%[%](%)%') `
    };
    for (let key in type_handler) {
        const regex = new RegExp(`${key}`, 'g');
        if (options.match(regex)) {
            if (sql_type_rlike != "") sql_type_rlike += "or ";
            sql_type_rlike += type_handler[key](options);
        }
    }
    if (sql_type_rlike == "") { // 未指定搜索块类型时，选择“搜索类型”中开启的块类型
        let types = "";
        let search_types = window.siyuan.storage['local-searchdata'].types;
        for (const key in search_types) {
            if (search_types[key]) types += type_mapping[key];
        }
        sql_type_rlike = `type REGEXP '^[${types}]$' `;
    }
    sql_type_rlike = "and (" + sql_type_rlike + ") ";
    return sql_type_rlike;
}
function transferSqlOrderby(options) {
    let sql_order_by = "order by case type";
    if (options != "") {
        for (let i = 0; i < options.length; i++) {
            sql_order_by += " when '" + options[i] + "' then " + i.toString();
        }
        sql_order_by += " end, updated desc";
    } else {
        sql_order_by = sql_default_order_by;
    }
    return sql_order_by;
}
function translateSearchInput(search_keywords) {
    if (search_keywords.length < 2) { return "-w" + search_keywords; }
    if (search_keywords.match("^-[wqrs]") != null) { return search_keywords; }
    if (search_keywords.match(/\|/) != null) { return translateSearchInputPipe(search_keywords); }
    let input_text_items            = parseInputItems(search_keywords);
    let key_words                   = input_text_items.key_words;          // 搜索关键词
    let excluded_key_words          = input_text_items.excluded_key_words; // 排除的关键词
    let options                     = input_text_items.options;            // 搜索选项
    let if_options_exist            = (options != "");
    let if_excluded_key_words_exist = (excluded_key_words.length != 0);
    g_keywords = key_words;
    g_search_group = window.siyuan.storage["local-searchdata"].group;
    if ((!if_options_exist) && (!if_excluded_key_words_exist)) {
        return "-w" + search_keywords; // 仅有关键词时使用关键词查询
    } else if ((!if_options_exist) && (if_excluded_key_words_exist)) {
        let query_syntax = "-q";  // 仅有关键词和排除关键词是使用查询语法查询
        for (let i = 0; i < key_words.length; i++) {
            query_syntax += " " + key_words[i];
        }
        for (let i = 0; i < excluded_key_words.length; i++) {
            query_syntax += " NOT " + excluded_key_words[i];
        }
        return query_syntax;
    }
    // 判断是否扩展范围搜索，若是则直接返回扩展范围搜索的sql语句
    if (options.match(/e/) != null) {
        g_search_group = 1; // 设置分组方式为按文档分组
        let sql_extended_search = "select path from blocks where type ='d' ";
        let sql_content_like = "";
        for (let i = 0; i < key_words.length; i++) {
            sql_extended_search += "and path in (select path from blocks where content like '%" + key_words[i] + "%') ";
            sql_content_like += "content like '%" + key_words[i] + "%' or ";
        }
        for (let i = 0; i < excluded_key_words.length; i++) {
            sql_extended_search += "and path not in (select path from blocks where content like '%" + excluded_key_words[i] + "%') ";
        }
        return "-s" + "select * from blocks where path in (" +
            sql_extended_search + ") and (" + sql_content_like.slice(0, -4) + ") and type not rlike '^[libs]$' " + // l i b s块类型不是叶子节点，重复
            sql_default_order_by;
    }

    // 一般搜索模式
    // sql 首部分
    let sql_prefix = "select * from blocks where ";
    // sql 搜索关键词
    let sql_key_words = transferSqlKeyWords(key_words, excluded_key_words);
    if (sql_key_words == "") { return "-w" }
    // sql 是否在当前文档搜索
    let sql_current_doc = "";
    if (options.match(/[kK]/) != null) {  // 当前文档或带子文档搜索
        let current_doc_id = document.querySelector(".fn__flex-1.protyle:not(.fn__none)").childNodes[1].childNodes[0].childNodes[0].getAttribute("data-node-id");
        sql_current_doc = options.match(/k/) ? `and path like '%${current_doc_id}.sy' ` // 在当前文档搜索
                                             : `and path rlike '${current_doc_id}' `;   // 在当前文档及子文档搜索
        options = options.replace(/[kK]/g, "");
    } 
    // sql 筛选搜索块类型
    let sql_type_rlike = transferSqlTypes(options);
    options = options.replace(/[DoOL1-6]/g, "");
    // sql 排序
    let sql_order_by = transferSqlOrderby(options);

    // 完整sql语句
    return "-s" + sql_prefix + sql_key_words + sql_type_rlike + sql_current_doc + sql_order_by;
}
function translateSearchInputPipe(search_keywords) {
    g_search_group = 1; // 设置分组方式为按文档分组
    let input_text_items = search_keywords.split("|");
    // 查询条件2
    let { key_words, excluded_key_words, options } = parseInputItems(input_text_items[input_text_items.length - 1]);
    let sql_key_words  = transferSqlKeyWords(key_words, excluded_key_words, "b.content");
    let sql_types      = transferSqlTypes(options);
    let sql_condition2 = sql_key_words + sql_types;
    let sql_order_by   = transferSqlOrderby(options);

    sql_key_words = transferSqlKeyWords(key_words, excluded_key_words); // 非递归查询的查询条件
    let sql_condition2_common = sql_key_words + sql_types;
    g_keywords = key_words; // 高亮关键词

    // 查询条件1
    ({ key_words, excluded_key_words, options } = parseInputItems(input_text_items[0]));
    options = options.replace(/[^Ddh]/g, ""); // 初始查询条件仅查询文档、标题

    if (options.match(/D/) == null) { // 仅在文档、标题下搜索
        sql_key_words = transferSqlKeyWords(key_words, excluded_key_words);
        sql_types = `and type GLOB '[${options == "" ? "dh" : options}]' `;
        let sql_recursive = `
        WITH RECURSIVE ChildBlocks AS (
            SELECT id, parent_id FROM blocks WHERE id IN (
                SELECT id FROM blocks WHERE ${sql_key_words + sql_types}
            )
            UNION ALL
            SELECT b.id, b.parent_id FROM blocks b
            INNER JOIN ChildBlocks cb ON b.parent_id = cb.id
        )
        SELECT DISTINCT b.* FROM blocks b
        JOIN ChildBlocks cb ON b.id = cb.id
        WHERE ${sql_condition2} ${sql_order_by}
        `;
        return "-s" + sql_recursive;
    } else { // 在文档及子文档下搜索
        sql_key_words = transferSqlKeyWords(key_words, excluded_key_words, "hpath");
        return `-sselect * from blocks where ${sql_key_words} and ${sql_condition2_common} ${sql_order_by} `; // 直接查询文档
    }
}

function highlightKeywords(search_list_text_nodes, keywords, highlight_type) {
    const ranges = [];
    keywords.forEach((keyword) => {
        const str = keyword.trim().toLowerCase();
        const range = search_list_text_nodes // 查找所有文本节点是否包含搜索词
            .map((el) => {
                const text = el.textContent.toLowerCase();
                const indices = [];
                let startPos = 0;
                while (startPos < text.length) {
                    const index = text.indexOf(str, startPos);
                    if (index === -1) break;
                    indices.push(index);
                    startPos = index + str.length;
                }
                return indices.map((index) => {
                    const range = document.createRange();
                    range.setStart(el, index);
                    range.setEnd(el, index + str.length);
                    return range;
                });
            });
        ranges.push(...range.flat());
    });
    const searchResultsHighlight = new Highlight(...ranges.flat()); // 创建高亮对象
    CSS.highlights.set(highlight_type, searchResultsHighlight);     // 注册高亮
}

let g_highlight_keywords = false;
class SimpleSearch extends siyuan.Plugin {
    inputSearchEvent(data) {
        let search_keywords            = data.detail.config.query;
        let search_keywords_translated = translateSearchInput(search_keywords);
        // 设置搜索参数
        data.detail.config.method = search_method_mapping[search_keywords_translated.slice(0, 2)];
        data.detail.config.query  = search_keywords_translated.slice(2);
        window.siyuan.storage["local-searchdata"].k = search_keywords; // 保存搜索关键词，下次打开索面板时默认填充
        
        if (search_keywords_translated.slice(0, 2) == "-s") {
            g_highlight_keywords     = true;
            data.detail.config.group = g_search_group; // 设置分组方式
        }
    }
    loadedProtyleStaticEvent() {    // 在界面加载完毕后高亮关键词
        CSS.highlights.clear();     // 清除上个高亮
        if (g_highlight_keywords) { // 判断是否需要高亮关键词
            // 需考虑搜索页签和搜索面板同时打开的情况，优先选择搜索面板的搜索框
            const search_list = document.querySelector('body>script~div[data-key="dialog-globalsearch"] #searchList')
                             || document.querySelector('#layouts #searchList'); // 搜索结果列表的节点
            if (search_list == null) return; // 判断是否存在搜索界面
            const search_list_text_nodes = Array.from(search_list.querySelectorAll(".b3-list-item__text"), el => el.firstChild); // 获取所有具有 b3-list-item__text 类的节点的文本子节点
            highlightKeywords(search_list_text_nodes, g_keywords, "highlight-keywords-search-list");
            const search_preview = document.querySelector('body>script~div[data-key="dialog-globalsearch"] #searchPreview')
                                || document.querySelector('#layouts #searchPreview'); // 搜索预览内容的节点
            const tree_walker = document.createTreeWalker(search_preview.children[1].children[0], NodeFilter.SHOW_TEXT); // 创建 createTreeWalker 迭代器，用于遍历文本节点，保存到一个数组
            const search_preview_text_nodes = [];
            let current_node = tree_walker.nextNode();
            while (current_node) {
                if (current_node.textContent.trim().length > 0) {
                    search_preview_text_nodes.push(current_node);
                }
                current_node = tree_walker.nextNode();
            }
            highlightKeywords(search_preview_text_nodes, g_keywords, "highlight-keywords-search-preview");
            g_highlight_keywords = false;
        }
        // 当使用按文档分组时，搜索列表认不再顶部，需要调整到顶部
        document.querySelector("#searchList").scrollTo({ top: 0, behavior: 'smooth' });
    }
    onLayoutReady() {
        this.eventBus.on("input-search", this.inputSearchEvent);
        this.eventBus.on("loaded-protyle-static", this.loadedProtyleStaticEvent);
        console.log("simple search start...")
    }

    onunload() {
        this.eventBus.off("input-search", this.inputSearchEvent);
        this.eventBus.off("loaded-protyle-static", this.loadedProtyleStaticEvent);
        console.log("simple search stop...")
    }
};

module.exports = {
    default: SimpleSearch,
};