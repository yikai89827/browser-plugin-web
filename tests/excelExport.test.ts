// 假设 excelExport 文件存在于 src 目录下，根据实际情况调整路径
import { exportToExcel } from '../utils/excelExport.ts';
import { utils, writeFile } from 'xlsx';
import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// 模拟xlsx库
jest.mock('xlsx', () => ({
    utils: {
        book_new: jest.fn(),
        json_to_sheet: jest.fn(),
        book_append_sheet: jest.fn()
    },
    writeFile: jest.fn()
}));

describe('exportToExcel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    const { book_new, json_to_sheet, book_append_sheet } = utils
    it('应该正确导出数据到Excel', () => {
        const mockData = [
            { id: 1, name: '优惠券1', value: '10%' },
            { id: 2, name: '优惠券2', value: '20%' }
        ];

        // 设置mock返回值
        const mockWorkbook = {};
        const mockWorksheet = {};
        (<jest.Mock>book_new).mockReturnValue(mockWorkbook);
        (<jest.Mock>json_to_sheet).mockReturnValue(mockWorksheet);

        exportToExcel(mockData);

        // 验证xlsx库的调用
        expect(book_new).toHaveBeenCalled();
        expect(json_to_sheet).toHaveBeenCalledWith(mockData);
        expect(book_append_sheet).toHaveBeenCalledWith(
            mockWorkbook,
            mockWorksheet,
            "优惠券"
        );
        expect(writeFile).toHaveBeenCalledWith(
            mockWorkbook,
            "亚马逊优惠券汇总.xlsx",
            { compression: true }
        );
    });

    it('空数据时应该处理而不报错', () => {
        exportToExcel([]);
        expect(book_new).toHaveBeenCalled();
        expect(writeFile).toHaveBeenCalled();
    });

    it('出错时应该捕获异常并打印错误', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        (<jest.Mock>book_new).mockImplementation(() => {
            throw new Error('模拟错误');
        });

        exportToExcel([{ test: 'data' }]);

        expect(consoleSpy).toHaveBeenCalledWith('导出失败', expect.any(Error));
        consoleSpy.mockRestore();
    });
});