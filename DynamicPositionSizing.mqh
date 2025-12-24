//+------------------------------------------------------------------+
//|                            DynamicPositionSizing.mqh              |
//|           DOM + ATR Influenced Position Limit Calculation         |
//|                          Copyright 2025, Professional Trading Co. |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, Professional Trading Co."
#property link      "https://www.mql5.com"
#property version   "1.00"
#property description "Advanced position sizing that adapts to market liquidity and volatility"

#ifndef DYNAMIC_POSITION_SIZING_MQH
#define DYNAMIC_POSITION_SIZING_MQH

#include <Trade/Trade.mqh>

//+------------------------------------------------------------------+
//| POSITION SIZING CONFIGURATION                                     |
//+------------------------------------------------------------------+
struct PositionSizingConfig
{
   // Base risk management
   double base_risk_percent;          // Base risk per trade (%)
   double max_risk_percent;           // Maximum risk allowed (%)
   double min_risk_percent;           // Minimum risk allowed (%)
   
   // DOM-based adjustments
   bool   use_dom_liquidity;          // Enable DOM liquidity scaling
   double dom_high_liquidity_bonus;   // Increase size in high liquidity (%)
   double dom_low_liquidity_penalty;  // Decrease size in low liquidity (%)
   double dom_imbalance_boost;        // Boost size with strong imbalance (%)
   
   // ATR-based adjustments
   bool   use_atr_volatility;         // Enable ATR volatility scaling
   double atr_low_vol_boost;          // Increase size in low vol (%)
   double atr_high_vol_penalty;       // Decrease size in high vol (%)
   double atr_squeeze_boost;          // Bonus for squeeze breakouts (%)
   
   // Position limit controls
   int    max_positions_low_vol;      // Max positions in low volatility
   int    max_positions_normal_vol;   // Max positions in normal volatility
   int    max_positions_high_vol;     // Max positions in high volatility
   double correlation_limit;          // Max correlation between positions
   
   // Safety limits
   double max_lot_per_trade;          // Absolute max lot size
   double min_lot_per_trade;          // Absolute min lot size
   double max_account_exposure;       // Max % of account in open trades
};

//+------------------------------------------------------------------+
//| POSITION SIZING CALCULATOR CLASS                                  |
//+------------------------------------------------------------------+
class CDynamicPositionSizing
{
private:
   PositionSizingConfig m_config;
   
   // Calculate liquidity score from DOM
   double CalculateLiquidityScore(double total_bid_vol, double total_ask_vol, 
                                   double bid_wall_vol, double ask_wall_vol)
   {
      double total_volume = total_bid_vol + total_ask_vol;
      double avg_volume = total_volume / 2.0;
      double max_wall = MathMax(bid_wall_vol, ask_wall_vol);
      
      // Normalize score (0-100)
      double base_score = MathMin(100, (total_volume / 100.0) * 10);
      
      // Boost for significant walls (institutional presence)
      if(max_wall > avg_volume * 3.0)
         base_score *= 1.2;
      
      return MathMin(100, base_score);
   }
   
   // Calculate DOM confidence multiplier
   double GetDOMConfidenceMultiplier(double imbalance_ratio, double liquidity_score,
                                      bool is_bullish_imbalance, bool is_bearish_imbalance,
                                      bool has_significant_wall, ENUM_ORDER_TYPE order_type)
   {
      double multiplier = 1.0;
      
      if(!m_config.use_dom_liquidity)
         return multiplier;
      
      // Liquidity adjustment
      if(liquidity_score > 70)
      {
         // High liquidity = safer to increase position
         multiplier += (m_config.dom_high_liquidity_bonus / 100.0);
      }
      else if(liquidity_score < 30)
      {
         // Low liquidity = reduce position
         multiplier -= (m_config.dom_low_liquidity_penalty / 100.0);
      }
      
      // Imbalance alignment bonus
      if(order_type == ORDER_TYPE_BUY && is_bullish_imbalance)
      {
         // Trading WITH the flow
         multiplier += (m_config.dom_imbalance_boost / 100.0);
         
         // Extra boost if significant wall supports direction
         if(has_significant_wall)
            multiplier += 0.05;
      }
      else if(order_type == ORDER_TYPE_SELL && is_bearish_imbalance)
      {
         // Trading WITH the flow
         multiplier += (m_config.dom_imbalance_boost / 100.0);
         
         if(has_significant_wall)
            multiplier += 0.05;
      }
      else if((order_type == ORDER_TYPE_BUY && is_bearish_imbalance) ||
              (order_type == ORDER_TYPE_SELL && is_bullish_imbalance))
      {
         // Trading AGAINST the flow = reduce position
         multiplier -= 0.15;
      }
      
      // Clamp multiplier
      return MathMax(0.5, MathMin(1.5, multiplier));
   }
   
   // Calculate ATR confidence multiplier
   double GetATRConfidenceMultiplier(bool is_low_vol, bool is_normal_vol, bool is_high_vol,
                                      bool is_squeeze, double expansion_potential)
   {
      double multiplier = 1.0;
      
      if(!m_config.use_atr_volatility)
         return multiplier;
      
      // Volatility regime adjustment
      if(is_low_vol)
      {
         // Low volatility = tighter stops = can increase position slightly
         multiplier += (m_config.atr_low_vol_boost / 100.0);
      }
      else if(is_high_vol)
      {
         // High volatility = wider stops = must reduce position
         multiplier -= (m_config.atr_high_vol_penalty / 100.0);
      }
      
      // Squeeze breakout bonus
      if(expansion_potential > 0)
      {
         // High-probability setup = increase position
         multiplier += (m_config.atr_squeeze_boost / 100.0);
      }
      else if(is_squeeze)
      {
         // During squeeze (not breakout) = reduce position
         multiplier -= 0.10;
      }
      
      // Clamp multiplier
      return MathMax(0.6, MathMin(1.4, multiplier));
   }

public:
   // Constructor
   CDynamicPositionSizing(void)
   {
      // Default configuration
      m_config.base_risk_percent = 1.0;
      m_config.max_risk_percent = 2.0;
      m_config.min_risk_percent = 0.5;
      
      m_config.use_dom_liquidity = true;
      m_config.dom_high_liquidity_bonus = 20.0;
      m_config.dom_low_liquidity_penalty = 30.0;
      m_config.dom_imbalance_boost = 15.0;
      
      m_config.use_atr_volatility = true;
      m_config.atr_low_vol_boost = 15.0;
      m_config.atr_high_vol_penalty = 25.0;
      m_config.atr_squeeze_boost = 25.0;
      
      m_config.max_positions_low_vol = 3;
      m_config.max_positions_normal_vol = 2;
      m_config.max_positions_high_vol = 1;
      m_config.correlation_limit = 0.7;
      
      m_config.max_lot_per_trade = 10.0;
      m_config.min_lot_per_trade = 0.01;
      m_config.max_account_exposure = 5.0;
   }
   
   // Set configuration
   void SetConfig(PositionSizingConfig &config) { m_config = config; }
   PositionSizingConfig GetConfig(void) { return m_config; }
   
   //+------------------------------------------------------------------+
   //| MAIN CALCULATION: Dynamic Position Size                          |
   //+------------------------------------------------------------------+
   double CalculatePositionSize(
      string symbol,
      double entry_price,
      double sl_price,
      ENUM_ORDER_TYPE order_type,
      // DOM parameters
      double total_bid_volume,
      double total_ask_volume,
      double imbalance_ratio,
      bool is_bullish_imbalance,
      bool is_bearish_imbalance,
      double bid_wall_volume,
      double ask_wall_volume,
      bool has_significant_wall,
      // ATR parameters
      bool is_low_volatility,
      bool is_normal_volatility,
      bool is_high_volatility,
      bool is_squeeze,
      double expansion_potential,
      double current_atr
   )
   {
      // Step 1: Calculate base position size (standard risk-based)
      double base_lot = CalculateBaseLotSize(symbol, entry_price, sl_price);
      
      if(base_lot <= 0)
         return 0;
      
      // Step 2: Calculate liquidity score
      double liquidity_score = CalculateLiquidityScore(
         total_bid_volume, total_ask_volume,
         bid_wall_volume, ask_wall_volume
      );
      
      // Step 3: Get DOM confidence multiplier
      double dom_multiplier = GetDOMConfidenceMultiplier(
         imbalance_ratio, liquidity_score,
         is_bullish_imbalance, is_bearish_imbalance,
         has_significant_wall, order_type
      );
      
      // Step 4: Get ATR confidence multiplier
      double atr_multiplier = GetATRConfidenceMultiplier(
         is_low_volatility, is_normal_volatility, is_high_volatility,
         is_squeeze, expansion_potential
      );
      
      // Step 5: Calculate final adjusted risk
      double base_risk = m_config.base_risk_percent;
      double adjusted_risk = base_risk * dom_multiplier * atr_multiplier;
      
      // Step 6: Clamp to min/max risk limits
      adjusted_risk = MathMax(m_config.min_risk_percent, 
                              MathMin(m_config.max_risk_percent, adjusted_risk));
      
      // Step 7: Recalculate lot size with adjusted risk
      double adjusted_lot = base_lot * (adjusted_risk / base_risk);
      
      // Step 8: Apply absolute lot limits
      adjusted_lot = MathMax(m_config.min_lot_per_trade,
                             MathMin(m_config.max_lot_per_trade, adjusted_lot));
      
      // Step 9: Normalize to broker requirements
      adjusted_lot = NormalizeLotSize(symbol, adjusted_lot);
      
      // Step 10: Check account exposure limit
      if(!CheckAccountExposureLimit(symbol, adjusted_lot, entry_price))
      {
         // Reduce to stay within exposure limits
         adjusted_lot = GetMaxAllowedLotSize(symbol, entry_price);
      }
      
      // Log the calculation
      PrintFormat("[POSITION SIZING] Base: %.2f | DOM×: %.2f | ATR×: %.2f | Risk: %.2f%% → %.2f%% | Final Lot: %.2f",
                  base_lot, dom_multiplier, atr_multiplier, 
                  base_risk, adjusted_risk, adjusted_lot);
      
      return adjusted_lot;
   }
   
   //+------------------------------------------------------------------+
   //| Calculate Base Lot Size (Standard Risk-Based)                    |
   //+------------------------------------------------------------------+
   double CalculateBaseLotSize(string symbol, double entry_price, double sl_price)
   {
      double account_equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double risk_money = account_equity * (m_config.base_risk_percent / 100.0);
      
      double tick_value = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
      double tick_size = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
      
      if(tick_value <= 0 || tick_size <= 0 || point <= 0)
         return 0;
      
      double sl_distance = MathAbs(entry_price - sl_price);
      double sl_pips = sl_distance / point;
      
      if(sl_pips <= 0)
         return 0;
      
      double money_per_pip = (tick_value / tick_size) * point;
      double loss_per_lot = sl_pips * money_per_pip;
      
      if(loss_per_lot <= 0)
         return 0;
      
      double lot_size = risk_money / loss_per_lot;
      
      return lot_size;
   }
   
   //+------------------------------------------------------------------+
   //| Normalize Lot Size to Broker Requirements                        |
   //+------------------------------------------------------------------+
   double NormalizeLotSize(string symbol, double lot_size)
   {
      double lot_step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
      double lot_min = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      double lot_max = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
      
      if(lot_step <= 0 || lot_min <= 0 || lot_max <= 0)
         return 0;
      
      // Round down to nearest step
      lot_size = MathFloor(lot_size / lot_step) * lot_step;
      
      // Clamp to broker limits
      lot_size = MathMax(lot_min, MathMin(lot_max, lot_size));
      
      return lot_size;
   }
   
   //+------------------------------------------------------------------+
   //| Check Account Exposure Limit                                     |
   //+------------------------------------------------------------------+
   bool CheckAccountExposureLimit(string symbol, double lot_size, double price)
   {
      double account_equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double max_exposure = account_equity * (m_config.max_account_exposure / 100.0);
      
      // Calculate current exposure
      double current_exposure = 0;
      for(int i = 0; i < PositionsTotal(); i++)
      {
         if(PositionSelectByTicket(PositionGetTicket(i)))
         {
            double pos_lot = PositionGetDouble(POSITION_VOLUME);
            double pos_price = PositionGetDouble(POSITION_PRICE_OPEN);
            string pos_symbol = PositionGetString(POSITION_SYMBOL);
            
            double contract_size = SymbolInfoDouble(pos_symbol, SYMBOL_TRADE_CONTRACT_SIZE);
            current_exposure += pos_lot * contract_size * pos_price;
         }
      }
      
      // Calculate new trade exposure
      double contract_size = SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      double new_exposure = lot_size * contract_size * price;
      
      double total_exposure = current_exposure + new_exposure;
      
      return (total_exposure <= max_exposure);
   }
   
   //+------------------------------------------------------------------+
   //| Get Max Allowed Lot Size Within Exposure Limits                  |
   //+------------------------------------------------------------------+
   double GetMaxAllowedLotSize(string symbol, double price)
   {
      double account_equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double max_exposure = account_equity * (m_config.max_account_exposure / 100.0);
      
      // Calculate current exposure
      double current_exposure = 0;
      for(int i = 0; i < PositionsTotal(); i++)
      {
         if(PositionSelectByTicket(PositionGetTicket(i)))
         {
            double pos_lot = PositionGetDouble(POSITION_VOLUME);
            double pos_price = PositionGetDouble(POSITION_PRICE_OPEN);
            string pos_symbol = PositionGetString(POSITION_SYMBOL);
            
            double contract_size = SymbolInfoDouble(pos_symbol, SYMBOL_TRADE_CONTRACT_SIZE);
            current_exposure += pos_lot * contract_size * pos_price;
         }
      }
      
      double remaining_exposure = max_exposure - current_exposure;
      
      if(remaining_exposure <= 0)
         return 0;
      
      double contract_size = SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      double max_lot = remaining_exposure / (contract_size * price);
      
      return NormalizeLotSize(symbol, max_lot);
   }
   
   //+------------------------------------------------------------------+
   //| Get Maximum Positions Allowed Based on Volatility                |
   //+------------------------------------------------------------------+
   int GetMaxPositionsAllowed(bool is_low_vol, bool is_normal_vol, bool is_high_vol)
   {
      if(is_low_vol)
         return m_config.max_positions_low_vol;
      else if(is_high_vol)
         return m_config.max_positions_high_vol;
      else
         return m_config.max_positions_normal_vol;
   }
   
   //+------------------------------------------------------------------+
   //| Check if New Position Would Exceed Correlation Limits            |
   //+------------------------------------------------------------------+
   bool CheckCorrelationLimit(string new_symbol, ENUM_ORDER_TYPE new_type)
   {
      // Get all open positions
      for(int i = 0; i < PositionsTotal(); i++)
      {
         if(PositionSelectByTicket(PositionGetTicket(i)))
         {
            string pos_symbol = PositionGetString(POSITION_SYMBOL);
            ENUM_POSITION_TYPE pos_type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
            
            // Calculate correlation between symbols
            double correlation = CalculateSymbolCorrelation(new_symbol, pos_symbol, 100);
            
            // Check if highly correlated and same direction
            bool same_direction = ((new_type == ORDER_TYPE_BUY && pos_type == POSITION_TYPE_BUY) ||
                                   (new_type == ORDER_TYPE_SELL && pos_type == POSITION_TYPE_SELL));
            
            if(MathAbs(correlation) > m_config.correlation_limit && same_direction)
            {
               PrintFormat("[CORRELATION] Rejected: %s and %s are %.2f%% correlated (limit: %.2f%%)",
                          new_symbol, pos_symbol, correlation * 100, m_config.correlation_limit * 100);
               return false;
            }
         }
      }
      
      return true;
   }
   
   //+------------------------------------------------------------------+
   //| Calculate Symbol Correlation (Simplified)                        |
   //+------------------------------------------------------------------+
   double CalculateSymbolCorrelation(string symbol1, string symbol2, int bars)
   {
      if(symbol1 == symbol2)
         return 1.0;
      
      double close1[], close2[];
      ArraySetAsSeries(close1, true);
      ArraySetAsSeries(close2, true);
      
      if(CopyClose(symbol1, PERIOD_H1, 0, bars, close1) < bars)
         return 0;
      if(CopyClose(symbol2, PERIOD_H1, 0, bars, close2) < bars)
         return 0;
      
      // Calculate returns
      double returns1[], returns2[];
      ArrayResize(returns1, bars - 1);
      ArrayResize(returns2, bars - 1);
      
      for(int i = 0; i < bars - 1; i++)
      {
         returns1[i] = (close1[i] - close1[i + 1]) / close1[i + 1];
         returns2[i] = (close2[i] - close2[i + 1]) / close2[i + 1];
      }
      
      // Calculate Pearson correlation
      double mean1 = 0, mean2 = 0;
      for(int i = 0; i < bars - 1; i++)
      {
         mean1 += returns1[i];
         mean2 += returns2[i];
      }
      mean1 /= (bars - 1);
      mean2 /= (bars - 1);
      
      double numerator = 0, denom1 = 0, denom2 = 0;
      for(int i = 0; i < bars - 1; i++)
      {
         double diff1 = returns1[i] - mean1;
         double diff2 = returns2[i] - mean2;
         numerator += diff1 * diff2;
         denom1 += diff1 * diff1;
         denom2 += diff2 * diff2;
      }
      
      if(denom1 == 0 || denom2 == 0)
         return 0;
      
      return numerator / MathSqrt(denom1 * denom2);
   }
};

#endif // DYNAMIC_POSITION_SIZING_MQH
//+------------------------------------------------------------------+