-- Add the closing-price change percentage as a first-class shared snapshot field.
-- BRS already supplies this value as pcp / closingChangePercent.
ALTER TABLE [dbo].[MarketSymbolCurrent]
ADD [closeChangePercent] DECIMAL(10,4) NULL;
